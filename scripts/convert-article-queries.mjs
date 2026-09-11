#!/usr/bin/env node
/**
 * One-time cleanup, companion to convert-taxonomy.mjs: rewrites every
 * migrated article's `<FindsQuery shortsql="...">` (the original site's
 * inline [[browseData]] embeds) to `<FindsQuery query={...}>`, using the
 * same already-verified ShortSQL parser. Run once, by hand; not part of
 * the normal build.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { parseShortSQL, secondarySortField } = await import('../src/utils/shortsql.ts');

const articlesDir = join(__dirname, '../src/content/articles');
let changedFiles = 0;
let changedTags = 0;

for (const file of readdirSync(articlesDir)) {
  const path = join(articlesDir, file);
  let text = readFileSync(path, 'utf8');
  let changed = false;

  text = text.replace(/<FindsQuery shortsql="((?:[^"\\]|\\.)*)" \/>/g, (_, escaped) => {
    const shortsql = escaped.replace(/\\"/g, '"');
    const parsed = parseShortSQL(shortsql);
    const query = { tb: parsed.tb };
    if (parsed.filter) query.filter = parsed.filter;
    if (parsed.sortField) query.sortField = parsed.sortField;
    if (parsed.sortDir) query.sortDir = parsed.sortDir;
    const secondary = secondarySortField(shortsql);
    if (secondary) query.sortField2 = secondary;
    if (parsed.limit) query.limit = parsed.limit;
    changed = true;
    changedTags++;
    return `<FindsQuery query={${JSON.stringify(query)}} />`;
  });

  if (changed) {
    writeFileSync(path, text, 'utf8');
    changedFiles++;
  }
}

console.log(`Converted ${changedTags} <FindsQuery> tag(s) across ${changedFiles} file(s).`);
