/**
 * Global inv_no -> canonical page URL index, built once (top-level await,
 * so every importer shares the same resolved module) by walking the full
 * taxonomy and running every leaf's query — lightweight (id + inv_no
 * only), not the full record detail.
 *
 * Needed because a handful of articles embed a `[[browseData]]` finds query
 * directly in their prose (see migration notes), outside of any taxonomy
 * category page, so there's no `recordHrefBase` a caller can just pass in —
 * this lets those inline grids link each record to wherever it actually
 * lives in the taxonomy, or render unlinked if it isn't published anywhere
 * (matching the original site's own behaviour for such records).
 */
import { flattenDomain } from './taxonomy.ts';
import { bdusListAll } from './bdus.ts';

const invNoToUrl = new Map<string, string>();

async function indexDomain(domain: 'islamic' | 'buddhist') {
  const nodes = flattenDomain(domain);
  for (const { parts, node } of nodes) {
    if (!node.query || node.query.tb !== 'finds') continue; // funcomplex has its own listing page, not indexed here
    const rows = await bdusListAll('finds', {
      filter: node.query.filter,
      sortField: node.query.sortField,
      sortDir: node.query.sortDir,
      limit: node.query.limit,
    });
    const base = `/${domain}/${parts.join('/')}`;
    for (const row of rows) {
      if (!invNoToUrl.has(row.inv_no)) {
        invNoToUrl.set(row.inv_no, `${base}/record/${encodeURIComponent(row.inv_no)}`);
      }
    }
  }
}

await Promise.all([indexDomain('islamic'), indexDomain('buddhist')]);

/** Canonical detail-page URL for a find's inv_no, or undefined if it isn't published in any taxonomy category. */
export function findUrl(invNo: string): string | undefined {
  return invNoToUrl.get(invNo);
}

/** Every published find as {invNo, url} — backs the static client-side search index. */
export function allFindUrls(): { invNo: string; url: string }[] {
  return Array.from(invNoToUrl.entries()).map(([invNo, url]) => ({ invNo, url }));
}
