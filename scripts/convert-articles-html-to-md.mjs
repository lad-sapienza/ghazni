#!/usr/bin/env node
/**
 * One-time cleanup: rewrites the prose HTML inside src/content/articles/
 * *.mdx (frontmatter and any `import ...;` lines left untouched) to plain
 * Markdown, in place. This is about readability/editability for whoever
 * hand-edits these files next — see README "For staff: editing text" —
 * not a data migration; every file here is already the canonical, hand-
 * maintained source.
 *
 * Kept as raw HTML/JSX, because plain Markdown can't express it:
 *   - the live embeds (<FindsQuery>, <Gallery>, <SketchfabEmbed>, <Map>)
 *   - an <a> or <img> carrying an attribute Markdown has no syntax for
 *     (target, rel, style, class, title) — a bare `<a href="...">text</a>`
 *     still becomes a normal `[text](url)` link
 *   - two files with real Bootstrap grid markup (container/row/col-*),
 *     where flattening to Markdown would destroy the column layout:
 *     research-team.mdx and geometric-patterns.mdx are skipped whole
 *
 * Dropped as pure editor artifacts, not data: empty `<p>`/`<div>` spacer
 * tags (old WYSIWYG's way of inserting blank space) and empty `<a name=
 * "...">`/`<a id="...">` anchor markers (verified none are linked to from
 * anywhere in this repo, including each article's own body — they're
 * dead leftovers from the original PHP site's page-local table of
 * contents, which this site doesn't have).
 *
 * Run with: node scripts/convert-articles-html-to-md.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import TurndownService from 'turndown';

const __dirname = dirname(fileURLToPath(import.meta.url));
const articlesDir = join(__dirname, '../src/content/articles');

const SKIP = new Set(['research-team.mdx', 'geometric-patterns.mdx']);

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// Placeholders carry the exact original markup back into the Markdown
// output verbatim (bypassing turndown's text-node escaping, which would
// otherwise mangle raw JSX attributes like `query={{...}}` — invalid as
// HTML — and any plain text that looked like Markdown syntax). "block"
// forces its own paragraph (the live embeds always stand alone in the
// source); "inline" is spliced in place, for an <a>/<img> that can appear
// mid-sentence or inside a list item.
let blocks, inlines;
turndown.addRule('mdx-block', {
  filter: (node) => node.nodeName === 'MDX-BLOCK',
  replacement: (_c, node) => `\n\n${blocks[Number(node.getAttribute('data-i'))]}\n\n`,
});
turndown.addRule('mdx-inline', {
  filter: (node) => node.nodeName === 'MDX-INLINE',
  replacement: (_c, node) => inlines[Number(node.getAttribute('data-i'))],
});
turndown.addRule('drop-empty-block', {
  filter: (node) => (node.nodeName === 'P' || node.nodeName === 'DIV') && node.textContent.replace(/ /g, '').trim() === '',
  replacement: () => '',
});

function placeholder(tag, list, s) {
  list.push(s);
  return `<${tag} data-i="${list.length - 1}">x</${tag}>`;
}

function convert(html) {
  blocks = [];
  inlines = [];

  // Legacy WYSIWYG italics-via-inline-style -> real <em>, so turndown's
  // default emphasis rule picks it up.
  html = html.replace(/<span style="font-style:\s*italic;?">(.*?)<\/span>/gs, '<em>$1</em>');

  // Dead in-page anchor markers (`<a name="x"></a>`) — see file header.
  html = html.replace(/<a\s+(?:name|id)="[^"]*"\s*>\s*<\/a>/g, '');

  // Live embeds — already final JSX; always stand alone in the source.
  html = html.replace(/<(FindsQuery|Gallery|SketchfabEmbed|Map)\b[^>]*\/>/g, (m) => placeholder('mdx-block', blocks, m));

  // <a>...</a> — a bare `<a href="...">text</a>` (href only, plain text,
  // no nested tags) is left for turndown's own link rule; anything else
  // (target/rel/style/class/title, or a nested <img>) is preserved as-is.
  html = html.replace(/<a\b[^>]*>.*?<\/a>/gs, (m) => (/^<a href="[^"]*">[^<]*<\/a>$/.test(m) ? m : placeholder('mdx-inline', inlines, m)));

  // Any remaining standalone <img> (none left unprotected by the <a> pass
  // in the current corpus, but kept for safety).
  html = html.replace(/<img\b[^>]*\/?>/g, (m) => placeholder('mdx-inline', inlines, m));

  return turndown
    .turndown(html)
    .replace(/ /g, ' ')
    .replace(/^ +$/gm, '') // blank out whitespace-only lines (leftover `<p>&nbsp;<Embed /></p>`), without touching a real `<br>` hard break's trailing two spaces
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let converted = 0;
let skipped = 0;

for (const file of readdirSync(articlesDir)) {
  if (!file.endsWith('.mdx')) continue;
  if (SKIP.has(file)) {
    skipped++;
    continue;
  }

  const path = join(articlesDir, file);
  const text = readFileSync(path, 'utf8');

  // Frontmatter, then any `import ...;` lines, then the body — see
  // migrate-articles.mjs's output shape (this script only ever runs
  // against files it produced). `frontmatter` keeps the one `\n` right
  // after the closing `---`; `rest` starts with the blank separator line.
  const fmEnd = text.indexOf('\n---\n', 4);
  if (fmEnd === -1) throw new Error(`${file}: couldn't find frontmatter's closing ---`);
  const frontmatter = text.slice(0, fmEnd + 5);
  let rest = text.slice(fmEnd + 5).replace(/^\n/, '');

  let imports = '';
  if (rest.startsWith('import ')) {
    const m = rest.match(/^(?:import[^\n]*\n)+/);
    imports = m[0];
    rest = rest.slice(imports.length).replace(/^\n/, '');
  }
  const body = rest;

  const out = frontmatter + '\n' + (imports ? imports + '\n' : '') + convert(body);
  writeFileSync(path, out, 'utf8');
  converted++;
}

console.log(`Converted: ${converted}, skipped (kept as HTML): ${skipped}`);
