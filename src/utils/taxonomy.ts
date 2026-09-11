import findsTaxonomy from '../data/finds-taxonomy.json' with { type: 'json' };

export interface TaxonomyNode {
  id: string;
  label: string;
  shortsql?: string;
  items?: Record<string, TaxonomyNode>;
}

const root = findsTaxonomy.finds as unknown as Record<string, TaxonomyNode>;

/** Walks `parts` (URL segments after the domain) down the tree, mirroring showContent.php's setCurrent(). */
export function getNode(domain: string, parts: string[]): TaxonomyNode | undefined {
  let current: TaxonomyNode | undefined = root[domain];
  for (const part of parts) {
    if (!current) return undefined;
    current = current.items?.[part];
  }
  return current;
}

export interface CrumbPart {
  id: string;
  label: string;
}

/** Every node in the tree for one domain, as a flat list of `{ parts, node }`, parts excluding the domain itself. */
export function flattenDomain(domain: 'islamic' | 'buddhist'): { parts: string[]; node: TaxonomyNode }[] {
  const out: { parts: string[]; node: TaxonomyNode }[] = [];
  function walk(node: TaxonomyNode, parts: string[]) {
    out.push({ parts, node });
    if (node.items) {
      for (const [key, child] of Object.entries(node.items)) {
        walk(child, [...parts, key]);
      }
    }
  }
  const domainRoot = root[domain];
  if (domainRoot?.items) {
    for (const [key, child] of Object.entries(domainRoot.items)) {
      walk(child, [key]);
    }
  }
  return out;
}

/** Breadcrumb labels for each step of `parts` (domain-relative), by walking the tree alongside them. */
export function breadcrumbLabels(domain: string, parts: string[]): CrumbPart[] {
  const crumbs: CrumbPart[] = [];
  let current: TaxonomyNode | undefined = root[domain];
  for (const part of parts) {
    current = current?.items?.[part];
    if (current) crumbs.push({ id: part, label: current.label });
  }
  return crumbs;
}
