#!/usr/bin/env node
/**
 * One-time cleanup: rewrites src/data/finds-taxonomy.json so every leaf
 * carries a native v5 filter (`query`) instead of the original v4 ShortSQL
 * string. Run once, by hand, against the ShortSQL-flavoured file — not part
 * of the normal build. Kept for audit/reference, same as
 * migrate-articles.mjs.
 *
 * Why: the ShortSQL syntax was kept at first as the safest literal
 * translation of the original site, verified against src/utils/shortsql.ts
 * (which is why this conversion is safe to do now — it's the same,
 * already-verified parser, just applied once and baked into the file
 * instead of re-run on every build). But going forward there's no reason to
 * keep authoring new categories in a v4 mini-language with no current
 * documentation, when v5's filter syntax is the one that's actually
 * documented and current.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { parseShortSQL } = await import('../src/utils/shortsql.ts');

const path = join(__dirname, '../src/data/finds-taxonomy.json');
const data = JSON.parse(readFileSync(path, 'utf8'));

function convertNode(node) {
  const out = { id: node.id, label: node.label };
  if (node.items) {
    out.items = {};
    for (const [key, child] of Object.entries(node.items)) {
      out.items[key] = convertNode(child);
    }
  } else if (node.shortsql?.startsWith('MSG:')) {
    out.message = node.shortsql.replace(/^MSG:\s*/, '');
  } else if (node.shortsql) {
    const parsed = parseShortSQL(node.shortsql);
    out.query = { tb: parsed.tb };
    if (parsed.filter) out.query.filter = parsed.filter;
    if (parsed.sortField) out.query.sortField = parsed.sortField;
    if (parsed.sortDir) out.query.sortDir = parsed.sortDir;
    if (parsed.limit) out.query.limit = parsed.limit;
  }
  return out;
}

const converted = {
  finds: Object.fromEntries(Object.entries(data.finds).map(([k, v]) => [k, convertNode(v)])),
};

writeFileSync(path, JSON.stringify(converted, null, 4) + '\n', 'utf8');
console.log(`Converted ${path} to native v5 query format.`);
