import type { APIRoute } from 'astro';
import { allFindEntries } from '../../utils/recordIndex';

// Static search index: every published find's inv_no, canonical URL, and
// enough context (category + object/material) for a meaningful result —
// loaded client-side by /search, see its inline script.
export const GET: APIRoute = () => {
  return new Response(JSON.stringify(allFindEntries()), {
    headers: { 'Content-Type': 'application/json' },
  });
};
