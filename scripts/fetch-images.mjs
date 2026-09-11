#!/usr/bin/env node
// --experimental-strip-types
/**
 * Pre-build step: downloads every BraDypUS-hosted image the site actually
 * references (taxonomy category pages + inline [[browseData]] embeds in
 * articles) into public/images/bdus/, ONCE. Astro components then just
 * resolve a local path (src/utils/localImages.ts) — the deployed site never
 * hot-links bdus.lad-sapienza.it at runtime.
 *
 * Already-downloaded files are skipped on subsequent runs, so a routine
 * rebuild only fetches what's new since the last one.
 */
import { readFileSync, readdirSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Local dev: read .env. CI (GitHub Actions): the secret is already in
// process.env, no .env file present — loadEnvFile would throw on that.
try {
  process.loadEnvFile?.(join(dirname(fileURLToPath(import.meta.url)), '../.env'));
} catch {
  /* no .env file — fine, rely on process.env */
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const { flattenDomain } = await import('../src/utils/taxonomy.ts');
const { bdusListAll, bdusRecord } = await import('../src/utils/bdus.ts');

const outDir = join(root, 'public/images/bdus');
mkdirSync(outDir, { recursive: true });
const already = new Set(readdirSync(outDir));

const recordIds = new Set(); // "tb:id"

async function collectFromShortSQLs(shortsqls) {
  const { parseShortSQL } = await import('../src/utils/shortsql.ts');
  for (const shortsql of shortsqls) {
    if (!shortsql || shortsql.startsWith('MSG:')) continue;
    const parsed = parseShortSQL(shortsql);
    const rows = await bdusListAll(parsed.tb, {
      filter: parsed.filter,
      sortField: parsed.sortField,
      sortDir: parsed.sortDir,
      limit: parsed.limit,
    });
    for (const row of rows) recordIds.add(`${parsed.tb}:${row.id}`);
  }
}

// 1. Every taxonomy leaf, both domains.
const taxonomyShortsqls = [
  ...flattenDomain('islamic').map((n) => n.node.shortsql),
  ...flattenDomain('buddhist').map((n) => n.node.shortsql),
].filter(Boolean);
await collectFromShortSQLs(taxonomyShortsqls);

// 2. Every inline [[browseData]] embed, now `<FindsQuery shortsql="...">` in the migrated MDX.
const articlesDir = join(root, 'src/content/articles');
const inlineShortsqls = [];
for (const file of readdirSync(articlesDir)) {
  const text = readFileSync(join(articlesDir, file), 'utf8');
  for (const m of text.matchAll(/<FindsQuery shortsql="((?:[^"\\]|\\.)*)"/g)) {
    inlineShortsqls.push(m[1].replace(/\\"/g, '"'));
  }
}
await collectFromShortSQLs(inlineShortsqls);

console.log(`Records to check for images: ${recordIds.size}`);

// 3. Fetch full detail for every unique record (reuses bdus.ts's in-process
// cache) and download each attached file. Concurrency-limited: this is
// thousands of records/files, sequential would take far too long.
async function pool(items, concurrency, fn) {
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
      done++;
      if (done % 200 === 0) console.log(`  ...${done}/${items.length}, ${downloaded} images downloaded so far`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

let downloaded = 0;

await pool([...recordIds], 15, async (key) => {
  const [tb, id] = key.split(':');
  const record = await bdusRecord(tb, id);
  for (const file of record.files ?? []) {
    const filename = `${file.id}.${file.ext.toLowerCase()}`;
    if (already.has(filename)) continue;
    already.add(filename); // reserve before await, so concurrent workers don't double-fetch
    const url = `https://bdus.lad-sapienza.it/projects/ghazni/files/${file.id}.${file.ext}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  ! ${url} -> HTTP ${res.status}`);
      continue;
    }
    writeFileSync(join(outDir, filename), Buffer.from(await res.arrayBuffer()));
    downloaded++;
  }
});

console.log(`Done. ${downloaded} new images downloaded (${already.size} total in public/images/bdus/).`);
