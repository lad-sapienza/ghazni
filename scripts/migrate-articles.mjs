#!/usr/bin/env node
/**
 * One-time migration: sites/default `articles` sqlite table -> src/content/articles/*.mdx
 *
 * Source data was exported once from the original PHP site's sqlite via:
 *   sqlite3 -json .../database.sqlite "select id,textid,title,sort,summary,text,
 *     keywords,author,status,created,publish,expires from articles;"
 *   sqlite3 -json .../database.sqlite "select at.articles_id as article_id,
 *     t.title as tag from articles_tag at join tag t on t.id = at.tag_id;"
 * and committed to scripts/migration-data/ so this script is reproducible
 * without the old PHP repo checked out alongside this one.
 *
 * This is a historical bootstrap script, run once — it is not part of the
 * normal build. Kept for audit/reference (see README "For staff/future
 * maintainers").
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodeHTML } from 'entities';

const __dirname = dirname(fileURLToPath(import.meta.url));
const articles = JSON.parse(readFileSync(join(__dirname, 'migration-data/articles.json'), 'utf8'));
const articleTags = JSON.parse(readFileSync(join(__dirname, 'migration-data/article_tags.json'), 'utf8'));

const tagsByArticle = new Map();
for (const { article_id, tag } of articleTags) {
  if (!tagsByArticle.has(article_id)) tagsByArticle.set(article_id, []);
  tagsByArticle.get(article_id).push(tag);
}

const outDir = join(__dirname, '../src/content/articles');
mkdirSync(outDir, { recursive: true });

function stripHtml(html) {
  // Strip tags first (the summary field is a one-liner blurb, only ever
  // wraps its text in a <p>), then decode entities — order matters, doing
  // it the other way could turn an entity-encoded "&lt;" into a real "<"
  // and have it misread as a tag by the strip step.
  return decodeHTML((html ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function yamlString(s) {
  if (s === undefined || s === null) return undefined;
  return JSON.stringify(s); // valid YAML flow scalar, avoids all escaping edge cases
}

/** Parses `key="value"` pairs out of a [[tag attr="val" ...]] opening tag's inner text. */
function parseAttrs(raw) {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(raw))) attrs[m[1]] = m[2];
  return attrs;
}

function jsxAttr(value) {
  return JSON.stringify(value ?? '');
}

/** Resolves a [[fig]] path attribute to a public URL, relative to this article's own media folder. */
function resolveFigPath(articleId, path) {
  const prefix = 'sites/default/images/articles/media/';
  if (path.startsWith(prefix)) {
    return '/images/articles/media/' + path.slice(prefix.length);
  }
  if (path.includes('/')) {
    // Defensive: any other nested path we haven't seen — pass through under media/.
    return `/images/articles/media/${articleId}/${path.split('/').pop()}`;
  }
  return `/images/articles/media/${articleId}/${path}`;
}

let usesFindsQuery, usesGallery, usesSketchfab;

function convertTags(articleId, html) {
  usesFindsQuery = usesGallery = usesSketchfab = false;

  // [[fig path="..." width="..." align="..."]][[/fig]]
  html = html.replace(/\[\[fig([^\]]*)\]\]\[\[\/fig\]\]/g, (_, attrsRaw) => {
    const a = parseAttrs(attrsRaw);
    const src = resolveFigPath(articleId, a.path);
    const alignClass = a.align === 'center' ? 'd-block mx-auto' : a.align === 'right' ? 'float-end ms-3' : a.align === 'left' ? 'float-start me-3' : '';
    const style = a.width ? ` style={{maxWidth: ${jsxAttr(a.width)}}}` : '';
    return `<img src=${jsxAttr(encodeURI(src))} class=${jsxAttr(alignClass)}${style} alt="" />`;
  });

  // [[link art="..."]]label[[/link]]
  html = html.replace(/\[\[link([^\]]*)\]\](.*?)\[\[\/link\]\]/gs, (_, attrsRaw, label) => {
    const a = parseAttrs(attrsRaw);
    const isExternal = /^https?:\/\//.test(a.art ?? '');
    const href = isExternal ? a.art : '/' + (a.art ?? '').replace(/^\/+/, '');
    const extra = isExternal ? ' target="_blank" rel="noreferrer"' : '';
    return `<a href=${jsxAttr(href)}${extra}>${label}</a>`;
  });

  // [[gallery]]name[[/gallery]]
  html = html.replace(/\[\[gallery\]\](.*?)\[\[\/gallery\]\]/gs, (_, name) => {
    usesGallery = true;
    return `<Gallery name=${jsxAttr(name.trim())} />`;
  });

  // [[sketchfab title="..."]]modelId[[/sketchfab]]
  html = html.replace(/\[\[sketchfab([^\]]*)\]\](.*?)\[\[\/sketchfab\]\]/gs, (_, attrsRaw, modelId) => {
    usesSketchfab = true;
    const a = parseAttrs(attrsRaw);
    return `<SketchfabEmbed modelId=${jsxAttr(modelId.trim())} title=${jsxAttr(a.title ?? '')} />`;
  });

  // [[browseData ...]]shortsql[[/browseData]] — the tag body IS the shortsql
  // (any tb="" attribute is redundant with the shortsql's own @table prefix).
  // One article (id 2, "browse-data") has a malformed/empty instance whose
  // "body" is unrelated trailing prose, not a shortsql — the original
  // (undocumented) shortcode processor's behaviour for that case is unknown,
  // so rather than guess, this just drops the (non-functional) tag markers
  // and leaves the enclosed text as plain prose.
  html = html.replace(/\[\[browseData([^\]]*)\]\](.*?)\[\[\/browseData\]\]/gs, (_, __, body) => {
    const shortsql = body.trim().replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    if (!shortsql.startsWith('@')) return body;
    usesFindsQuery = true;
    return `<FindsQuery shortsql=${jsxAttr(shortsql)} />`;
  });

  // [[map ...]]Title[[/map]] — single occurrence sitewide; kept generic in
  // case more appear later. Renders sCMS's own Map, centered on the point.
  // client:only, not client:load: MapLibre draws to a <canvas> it fully
  // owns, so there's no meaningful server-rendered markup to hydrate onto
  // in the first place — client:load's SSR pass produces a mismatch (React
  // error #418) even when the two renders are otherwise "the same".
  html = html.replace(/\[\[map([^\]]*)\]\](.*?)\[\[\/map\]\]/gs, (_, attrsRaw) => {
    const a = parseAttrs(attrsRaw);
    const [lat, lng] = (a.marker ?? '').split(',').map((s) => s.trim());
    return `<Map client:only="react" center=${jsxAttr(`${lng},${lat},${a.zoom ?? 10}`)} height="400px" />`;
  });

  // A few articles link straight to a media file (PDFs, mostly) via a plain
  // <a href="sites/default/images/..."> outside of any [[tag]] shortcode.
  html = html.replaceAll('sites/default/images/', '/images/');

  return html;
}

let written = 0;
let skipped = 0;

for (const art of articles) {
  if (art.status !== 1) {
    console.log(`skip (unpublished): ${art.textid}`);
    skipped++;
    continue;
  }

  const body = convertTags(art.id, art.text ?? '');
  const tags = tagsByArticle.get(art.id) ?? [];
  const summary = stripHtml(art.summary);

  const imports = [];
  if (usesFindsQuery) imports.push(`import FindsQuery from '../../components/finds/FindsQuery.astro';`);
  if (usesGallery) imports.push(`import Gallery from '@lad-sapienza/scms-core/components/Gallery/Gallery.astro';`);
  if (usesSketchfab) imports.push(`import SketchfabEmbed from '../../components/SketchfabEmbed.astro';`);
  if (body.includes('<Map ')) imports.push(`import { Map } from '@lad-sapienza/scms-core/components/Map';`);

  const frontmatter = [
    '---',
    `id: ${art.id}`,
    `textid: ${yamlString(art.textid)}`,
    `title: ${yamlString(art.title)}`,
    summary ? `summary: ${yamlString(summary)}` : null,
    tags.length ? `tags: ${JSON.stringify(tags)}` : null,
    art.author ? `author: ${yamlString(art.author)}` : null,
    art.publish ? `publish: ${yamlString(art.publish)}` : null,
    art.sort ? `sort: ${art.sort}` : null,
    '---',
  ].filter(Boolean).join('\n');

  const out = [frontmatter, '', ...imports, imports.length ? '' : null, body].filter((l) => l !== null).join('\n');

  writeFileSync(join(outDir, `${art.textid}.mdx`), out, 'utf8');
  written++;
}

console.log(`\nWritten: ${written}, skipped: ${skipped}`);
