/**
 * Finds-taxonomy category intros — the text shown above a category's
 * records grid (e.g. "Arches", "Dado with Persian inscription (type 14)")
 * — fetched from BraDypUS's `finds_categories` table at build time.
 *
 * Unlike src/content/articles (hand-maintained, one-off pages), these are
 * tightly coupled 1:1 to a node in src/data/finds-taxonomy.json (same
 * `node_id` as the node's own `id`) and are edited in BraDypUS directly,
 * same as the blog — see src/utils/blog.ts for the sibling pattern.
 */
import { bdusQueryFull } from './bdus';
import { renderMarkdown } from './markdown';

export interface FindsCategory {
  nodeId: string;
  domain: 'islamic' | 'buddhist';
  title: string;
  summary?: string;
  bodyHtml: string;
}

async function toFindsCategory(record: any): Promise<FindsCategory> {
  const core = record.core ?? {};
  const val = (name: string) => core[name]?.val;
  return {
    nodeId: val('node_id'),
    domain: val('domain'),
    title: val('title'),
    summary: val('summary') || undefined,
    bodyHtml: await renderMarkdown(val('body')),
  };
}

let cached: Promise<Map<string, FindsCategory>> | undefined;

/** Every published category intro, keyed by node_id. Fetched once per build and memoized. */
export async function findsCategoriesByNodeId(): Promise<Map<string, FindsCategory>> {
  cached ??= (async () => {
    const records = await bdusQueryFull({ tb: 'finds_categories', filter: { status: { _eq: 'published' } } });
    const categories = await Promise.all(records.map(toFindsCategory));
    return new Map(categories.map((c) => [c.nodeId, c]));
  })();
  return cached;
}
