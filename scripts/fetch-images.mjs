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
import { readFileSync, readdirSync, mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
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

// This script and the `astro build` that follows it are separate Node
// processes, so bdus.ts's in-memory cache alone doesn't stop `astro build`
// from re-fetching everything this script already fetched — hence its
// on-disk .bdus-cache/. That cache is only meant to bridge THESE two
// processes for THIS build, not survive to the next one, so wipe it before
// anything else runs (this script always runs first, see package.json).
rmSync(join(root, '.bdus-cache'), { recursive: true, force: true });

const { flattenDomain } = await import('../src/utils/taxonomy.ts');
const { bdusListAll, bdusRecord } = await import('../src/utils/bdus.ts');

const outDir = join(root, 'public/images/bdus');
mkdirSync(outDir, { recursive: true });
const already = new Set(readdirSync(outDir));

const recordIds = new Set(); // "tb:id"

async function collectFromQueries(queries) {
  for (const query of queries) {
    if (!query) continue;
    const rows = await bdusListAll(query.tb, {
      filter: query.filter,
      sortField: query.sortField,
      sortDir: query.sortDir,
      limit: query.limit,
    });
    for (const row of rows) recordIds.add(`${query.tb}:${row.id}`);
  }
}

// 1. Every taxonomy leaf, both domains.
const taxonomyQueries = [
  ...flattenDomain('islamic').map((n) => n.node.query),
  ...flattenDomain('buddhist').map((n) => n.node.query),
].filter(Boolean);
await collectFromQueries(taxonomyQueries);

// 1b. Every published blog post (src/utils/blog.ts fetches the same table
// the same way — its cover + gallery images need to already be here).
await collectFromQueries([{ tb: 'blog', filter: { status: { _eq: 'published' } } }]);

// 2. Every inline data embed, `<FindsQuery query={...} />` in the migrated MDX
// (was [[browseData]]...[[/browseData]] in the original site). The query
// object can nest (filter._and/._or), so a non-greedy regex would truncate
// at the first inner `}` — find the JSX attribute's `{`, then scan for its
// matching `}` by brace depth instead.
function extractJsxObjectAttrs(text, attrName) {
  const results = [];
  const marker = `${attrName}={`;
  let from = 0;
  while (true) {
    const start = text.indexOf(marker, from);
    if (start === -1) break;
    // `marker` already ends at the JSX-expression-container '{'; the value
    // itself is an object literal, so its own '{' is the next char —
    // that's the one to depth-count from (else the slice below would keep
    // the wrapper brace too and produce invalid, unparseable JSON).
    const objStart = start + marker.length;
    let depth = 0;
    let i = objStart;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    results.push(text.slice(objStart, i + 1));
    from = i + 1;
  }
  return results;
}

const articlesDir = join(root, 'src/content/articles');
const inlineQueries = [];
for (const file of readdirSync(articlesDir)) {
  const text = readFileSync(join(articlesDir, file), 'utf8');
  for (const json of extractJsxObjectAttrs(text, 'query')) {
    inlineQueries.push(JSON.parse(json));
  }
}
await collectFromQueries(inlineQueries);

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
    if (!file.is_image) continue; // records sometimes carry PDFs (reports, scans) alongside photos — never displayed, not worth the space
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
