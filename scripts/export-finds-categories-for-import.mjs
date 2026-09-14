#!/usr/bin/env node
/**
 * Exports the 147 finds-taxonomy "container" articles — the intro text
 * shown above each category's records grid — as a CSV for BraDypUS's own
 * bulk-import UI (POST /api/import/data), the same workaround used for the
 * blog migration (see export-blog-for-import.mjs) after the API's
 * record-create endpoint turned out to fail for every table when
 * authenticated via API key.
 *
 * An article is included only if its textid matches a node id anywhere in
 * src/data/finds-taxonomy.json — same rule as everywhere else in this
 * migration. `title` is taken from the taxonomy node's own `label`, not
 * the article's frontmatter `title`: the two disagree for ~30 articles
 * (the article title is often an old breadcrumb-style string like
 * "Brickwork/pilasters", left over from before this site had a real
 * breadcrumb UI) — the taxonomy label is what the live site actually
 * shows today, so it's the one source of truth kept once this table
 * exists. `sort` and `tags` are dropped entirely — confirmed unused for
 * this set of articles (see conversation notes / commit history).
 *
 * `body` drops a trailing `## Records` heading + <FindsQuery> embed where
 * still present: the taxonomy page (CategoryPage.astro) already renders
 * that grid itself from the node's own `query`, so an embedded one here
 * would duplicate it (the bug flagged separately — some articles already
 * had this removed by that fix, this strips any stragglers defensively).
 *
 * One-time script, not part of the normal build. Run with:
 *   node scripts/export-finds-categories-for-import.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const articlesDir = join(root, 'src/content/articles');
const outDir = join(root, 'scripts/migration-data');

const taxonomy = JSON.parse(readFileSync(join(root, 'src/data/finds-taxonomy.json'), 'utf8'));

/** node id -> { label, domain } for every node anywhere in the tree. */
const nodeInfo = new Map();
for (const [domain, root_] of Object.entries(taxonomy.finds)) {
  (function walk(node) {
    if (typeof node.id === 'string') nodeInfo.set(node.id, { label: node.label, domain });
    if (node.items) for (const child of Object.values(node.items)) walk(child);
  })(root_);
}

function parseFrontmatter(raw) {
  const end = raw.indexOf('\n---\n', 4);
  const fm = raw.slice(0, end);
  const rest = raw.slice(end + 5).replace(/^\n/, '');
  const data = {};
  for (const line of fm.split('\n').slice(1)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    try {
      data[m[1]] = JSON.parse(m[2]);
    } catch {
      data[m[1]] = m[2];
    }
  }
  const body = rest.startsWith('import ') ? rest.slice(rest.indexOf('\n\n') + 2) : rest;
  return { data, body };
}

/** Strips a trailing `## Records` / <FindsQuery> block, if still present. */
function stripRecordsBlock(body) {
  return body.replace(/\n*(?:---\n\n)?(?:## Records\n\n)?<FindsQuery\b[^\n]*\/>\s*$/, '').trim();
}

function csvField(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const header = ['node_id', 'domain', 'title', 'summary', 'body', 'status'];
const rows = [header];

let matched = 0;
for (const file of readdirSync(articlesDir).sort()) {
  if (!file.endsWith('.mdx')) continue;
  const textid = file.slice(0, -4);
  const info = nodeInfo.get(textid);
  if (!info) continue;

  const raw = readFileSync(join(articlesDir, file), 'utf8');
  const { data, body } = parseFrontmatter(raw);

  rows.push([textid, info.domain, info.label, data.summary ?? '', stripRecordsBlock(body), 'published']);
  matched++;
}

const csv = rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
const csvPath = join(outDir, 'finds-categories.csv');
writeFileSync(csvPath, csv, 'utf8');

console.log(`${matched} category intros -> ${csvPath}`);
