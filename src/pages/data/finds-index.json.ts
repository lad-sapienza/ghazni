import type { APIRoute } from 'astro';
import { allFindUrls } from '../../utils/recordIndex';

// Static search index: every published find's inv_no + canonical URL.
// Loaded client-side by /search — see its inline script.
export const GET: APIRoute = () => {
  return new Response(JSON.stringify(allFindUrls()), {
    headers: { 'Content-Type': 'application/json' },
  });
};
