#!/usr/bin/env node
// --experimental-strip-types
/**
 * Alternative to migrate-blog-to-bdus.mjs: the BraDypUS API's record-create
 * endpoint (POST /api/record/{tb}) currently fails with a generic
 * "Database error" for this table when authenticated via API key (see
 * migration notes / conversation with the BraDypUS maintainer) — it may
 * simply not be meant for bulk writes. BraDypUS has a proper bulk-import
 * path instead (CSV -> POST /api/import/data, ZIP of photos ->
 * POST /api/import/photos with key_field), meant to be driven from its own
 * admin UI. This script produces the two files that flow needs:
 *
 *   scripts/migration-data/blog-posts.csv    — one row per post, including
 *                                               a sequential `id` (1..N)
 *   scripts/migration-data/blog-covers.zip   — cover images, renamed to
 *                                               {id}.jpg (same id as the
 *                                               CSV row) so BraDypUS's
 *                                               photo import can match each
 *                                               one to its record via `id`
 *                                               as key_field
 *
 * The body column is real Markdown, not the MDX files' original raw HTML —
 * converted with turndown, which drops purely-visual markup (inline
 * style=, custom-font spans, alignment, Bootstrap utility classes, etc. —
 * none of that has a Markdown equivalent, so it's dropped by construction)
 * while keeping semantic formatting (headings, bold/italic, links, lists,
 * images) as real Markdown syntax.
 *
 * One-time script, not part of the normal build.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import TurndownService from 'turndown';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const blogDir = join(root, 'src/content/blog');
const outDir = join(root, 'scripts/migration-data');
mkdirSync(outDir, { recursive: true });

const SITE_URL = 'https://ghazni.lad-sapienza.it';
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

function toMarkdown(html) {
  return turndown
    .turndown(html)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function csvField(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const header = ['id', 'title', 'slug', 'summary', 'body', 'author', 'publish_date', 'status', 'cover_image_url'];
const rows = [header];

const coversDir = join(outDir, 'blog-covers');
rmSync(coversDir, { recursive: true, force: true });
mkdirSync(coversDir, { recursive: true });

let withCover = 0;
const files = readdirSync(blogDir).filter((f) => f.endsWith('.mdx')).sort();
files.forEach((file, i) => {
  const id = i + 1;
  const raw = readFileSync(join(blogDir, file), 'utf8');
  const { frontmatter, content } = parseFrontmatter(raw);

  const coverPath = join(root, `public/images/articles/800x600/${frontmatter.id}.jpg`);
  const hasCover = existsSync(coverPath);
  const coverUrl = hasCover ? `${SITE_URL}/images/articles/800x600/${frontmatter.id}.jpg` : '';
  if (hasCover) {
    copyFileSync(coverPath, join(coversDir, `${id}.jpg`));
    withCover++;
  }

  rows.push([
    id,
    frontmatter.title,
    frontmatter.textid,
    frontmatter.summary ?? '',
    toMarkdown(content),
    frontmatter.author ?? '',
    frontmatter.publish ?? '',
    'published',
    coverUrl,
  ]);
});

const csv = rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
const csvPath = join(outDir, 'blog-posts.csv');
writeFileSync(csvPath, csv, 'utf8');

const zipPath = join(outDir, 'blog-covers.zip');
rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', '-j', zipPath, coversDir], { cwd: outDir });
rmSync(coversDir, { recursive: true, force: true });

console.log(`${files.length} posts -> ${csvPath}`);
console.log(`${withCover} cover images -> ${zipPath} (missing for: ${files.length - withCover})`);
