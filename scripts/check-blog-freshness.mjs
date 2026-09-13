#!/usr/bin/env node
/**
 * Prints the latest `updated_at` among published BraDypUS blog posts, for
 * .github/workflows/check-blog-updates.yml to compare against the value it
 * saw last time. A standalone, lightweight read — kept separate from
 * src/utils/bdus.ts (the build-time client, with an on-disk cache this
 * doesn't want and isn't part of `npm run build`).
 */
const BASE_URL = process.env.BDUS_BASE_URL ?? 'https://bdus.lad-sapienza.it/ghazni';
const KEY = process.env.BDUS_API_KEY;

const listRes = await fetch(`${BASE_URL}/api/records/blog`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ per_page: 200, page: 1, filter: { status: { _eq: 'published' } } }),
});
const { data: previews } = await listRes.json();

// The list endpoint doesn't return `updated_at` (present in its declared
// field list, but always empty in practice) — only full record detail
// does, so fetch every published post's detail rather than the cheaper
// list-only query. Still lightweight: ~38 small requests, not the
// thousands a full site build makes.
const details = await Promise.all(
  previews.map((p) =>
    fetch(`${BASE_URL}/api/record/blog/${p.id}`, { headers: { Authorization: `Bearer ${KEY}` } }).then((r) => r.json())
  )
);

const latest = details
  .map((d) => d.core?.updated_at?.val)
  .filter(Boolean)
  .sort()
  .at(-1) ?? '';

console.log(latest);
