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

interface IndexEntry {
  url: string;
  /** e.g. "Islamic Ghazni — Alabaster" — the taxonomy category label, for search-result context (no extra API cost: piggybacks on the list query already needed for the URL). */
  label: string;
  /** Preview object/material text (whichever the list endpoint returned), if any — e.g. "Mould". */
  detail?: string;
}

const domainLabel: Record<'islamic' | 'buddhist', string> = {
  islamic: 'Islamic Ghazni',
  buddhist: 'Buddhist Ghazni',
};

const invNoToEntry = new Map<string, IndexEntry>();

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
    const base = `/${domain}/finds/${parts.join('/')}`;
    for (const row of rows) {
      if (!invNoToEntry.has(row.inv_no)) {
        invNoToEntry.set(row.inv_no, {
          url: `${base}/record/${encodeURIComponent(row.inv_no)}`,
          label: `${domainLabel[domain]} — ${node.label}`,
          detail: row.object || row.main_material || undefined,
        });
      }
    }
  }
}

await Promise.all([indexDomain('islamic'), indexDomain('buddhist')]);

/** Canonical detail-page URL for a find's inv_no, or undefined if it isn't published in any taxonomy category. */
export function findUrl(invNo: string): string | undefined {
  return invNoToEntry.get(invNo)?.url;
}

/** Every published find, with enough context for a meaningful search result — backs the static client-side search index. */
export function allFindEntries(): (IndexEntry & { invNo: string })[] {
  return Array.from(invNoToEntry.entries()).map(([invNo, entry]) => ({ invNo, ...entry }));
}
