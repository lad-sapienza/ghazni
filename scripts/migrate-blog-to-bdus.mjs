#!/usr/bin/env node
// --experimental-strip-types
/**
 * One-time migration: src/content/blog/*.mdx -> BraDypUS's `blog` table.
 *
 * The blog moved from static MDX (git-committed, edited via PRs) to
 * BraDypUS (edited by staff directly in the BraDypUS UI, fetched at build
 * time like every other dynamic content on this site — see src/utils/blog.ts
 * and README "Publishing a new blog post"). This script pushes the 38
 * already-migrated posts into the new `blog` table so nothing is lost in
 * the switch, then its job is done — it is not part of the normal build.
 *
 * Each post's body is migrated AS-IS (raw HTML, same as it already was in
 * the MDX files) into BraDypUS's markdown `body` field — verified
 * beforehand that Astro's markdown processor passes raw HTML straight
 * through unchanged, so this needs no HTML->Markdown conversion. Any
 * inline <img> tags in that body keep pointing at the already-committed
 * public/images/articles/media/ files (unchanged, still served by this
 * repo) — only the post's own 800x600 cover thumbnail is re-hosted, as
 * this new record's first (and only) attached file, per the new
 * cover-image-is-the-first-attached-file design.
 *
 * Requires a WRITE-capable BraDypUS API key (edit privilege) in
 * BDUS_WRITE_API_KEY — deliberately a different env var from the
 * read-only BDUS_API_KEY the normal build uses, so a write credential is
 * never mistakenly available to routine build-time code. Set it in your
 * local .env only (never a CI secret — this script is never run in CI),
 * and it can be revoked in BraDypUS once this migration is done.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';

try {
  process.loadEnvFile?.(join(dirname(fileURLToPath(import.meta.url)), '../.env'));
} catch {
  /* no .env file — fine, rely on process.env */
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const BASE_URL = process.env.BDUS_BASE_URL ?? 'https://bdus.lad-sapienza.it/ghazni';
const WRITE_KEY = process.env.BDUS_WRITE_API_KEY;
if (!WRITE_KEY) {
  throw new Error(
    'BDUS_WRITE_API_KEY is not set. Create an edit-privilege API key for the `ghazni` app in BraDypUS, add it to .env as BDUS_WRITE_API_KEY, and re-run. This is deliberately separate from BDUS_API_KEY (read-only) — do not reuse that one.'
  );
}

async function bdusApi(path, init) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${WRITE_KEY}`, ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok || data.status === 'error') {
    throw new Error(`BraDypUS API ${path} -> ${res.status} ${data.code ?? ''}: ${data.detail ?? await res.text?.() ?? ''}`);
  }
  return data;
}

async function createBlogRecord(core) {
  const result = await bdusApi('/api/record/blog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ core }),
  });
  return result.id;
}

async function attachCoverFile(recordId, filePath) {
  const bytes = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes]), basename(filePath));
  await bdusApi(`/api/record/blog/${recordId}/file`, { method: 'POST', body: form });
}

const blogDir = join(root, 'src/content/blog');
const files = readdirSync(blogDir).filter((f) => f.endsWith('.mdx'));
console.log(`Migrating ${files.length} blog posts to BraDypUS...`);

let migrated = 0;
let withCover = 0;
for (const file of files) {
  const raw = readFileSync(join(blogDir, file), 'utf8');
  const { frontmatter, content } = parseFrontmatter(raw);

  const recordId = await createBlogRecord({
    title: frontmatter.title,
    slug: frontmatter.textid,
    body: content.trim(),
    summary: frontmatter.summary ?? '',
    author: frontmatter.author ?? '',
    publish_date: frontmatter.publish ?? '',
    status: 'published',
  });

  const coverPath = join(root, `public/images/articles/800x600/${frontmatter.id}.jpg`);
  if (existsSync(coverPath)) {
    await attachCoverFile(recordId, coverPath);
    withCover++;
  }

  migrated++;
  console.log(`  [${migrated}/${files.length}] ${frontmatter.textid} -> blog #${recordId}${existsSync(coverPath) ? ' (+cover)' : ''}`);
}

console.log(`Done. ${migrated} posts created, ${withCover} with a cover image.`);
