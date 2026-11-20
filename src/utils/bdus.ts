/**
 * BraDypUS v5 API client for ghazni.
 *
 * Build-time only: every call here runs inside Astro frontmatter /
 * getStaticPaths while `astro build` is running in Node, never in the
 * browser. The API key (BDUS_API_KEY, read-only privilege) therefore never
 * reaches the client bundle — see README "Updating the site" for why this
 * matters for a fully static, GitHub Pages–hosted site.
 *
 * Thin wrapper around `@lad-sapienza/scms-core`'s shared bdus5 client
 * (`.../integrations/bdusQuery`) rather than a reimplementation: this file
 * now only keeps what's genuinely ghazni-specific —
 *
 * - The on-disk cache bridging `fetch-images.mjs` and `astro build` (two
 *   separate Node processes within one `npm run build`; without it every
 *   record got fetched twice — see DISK_CACHE_DIR below). The shared client
 *   has no such cache (a published package can't assume a build pipeline
 *   shaped like this one), so it stays local, wrapping the shared
 *   `bdusRecord`.
 * - `bdusQueryFull`'s single-object `{ tb, filter, ... }` signature and
 *   concurrency-10 pooling (every call site in this app already expects
 *   this exact shape) — ghazni's own `pool()`, calling the locally cached
 *   `bdusRecord` below, not the shared `bdusQueryFull` (whose contract
 *   differs: it takes `(config, tb, opts)` and returns records *flattened*
 *   via `normalizeBdusRecord`, whereas every consumer here reads the raw
 *   nested shape, e.g. `record.core?.invno?.val` — matching what the shared
 *   client's own un-normalized `bdusRecord` already returns).
 *
 * What's delegated: the actual HTTP fetch, pagination and 429 retry/backoff
 * (`bdusListAll`/`bdusRecord` from the shared client) — this file never had
 * retry/backoff of its own, so that's a reliability improvement "for free".
 */
import type { FilterNode } from './shortsql.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  bdusListAll as sharedBdusListAll,
  bdusRecord as sharedBdusRecord,
  bdusFileUrl as sharedBdusFileUrl,
  getBdusServerConfig,
} from '@lad-sapienza/scms-core/integrations/bdusQuery';

// getBdusServerConfig reads BDUS_BASE_URL/BDUS_API_KEY itself (process.env or
// import.meta.env); the explicit baseUrl here is only the fallback default
// this app has always had, for when BDUS_BASE_URL isn't set.
const resolvedConfig = getBdusServerConfig('https://bdus.lad-sapienza.it/ghazni');
if (!resolvedConfig || !resolvedConfig.apiKey) {
  throw new Error(
    'BDUS_API_KEY is not set. Copy .env.example to .env and fill in a read-only API key for the `ghazni` app (see README).'
  );
}
const config = resolvedConfig;

// In-memory: the same find often shows up in a category grid, a record page
// and a funerary-complex's linked-finds preview. Memoizing avoids re-fetching
// it three times in the same process.
const cache = new Map<string, Promise<any>>();

// On-disk, in addition: `npm run build` runs fetch-images.mjs and `astro
// build` as two SEPARATE Node processes, so the in-memory cache alone still
// meant every record got fetched twice per build (once to check/download its
// images, once again to render its page) — the dominant cost of a build,
// dwarfing the actual image bytes. This directory bridges the two processes
// within one `npm run build` run. It is NOT meant to survive to the next
// run — scripts/fetch-images.mjs (always first in the build) deletes it
// before doing anything, so every build still sees live BraDypUS data as of
// that moment; only the two sub-processes *within* that one build share it.
const DISK_CACHE_DIR = join(process.cwd(), '.bdus-cache');

function diskCachePath(cacheKey: string): string {
  const hash = createHash('sha256').update(cacheKey).digest('hex');
  return join(DISK_CACHE_DIR, `${hash}.json`);
}

export interface BdusListOptions {
  filter?: FilterNode;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  /** Restrict to N results (after any secondary in-memory sort). Mirrors ShortSQL's limit clause. */
  limit?: number;
}

/** Fetches every row matching a filter, paginating internally (v5 caps per_page at 200). */
export async function bdusListAll(tb: string, opts: BdusListOptions = {}): Promise<any[]> {
  return sharedBdusListAll(config, tb, opts);
}

/** Fetches the full nested record (core/plugins/files/schema) by internal numeric id — cached, see DISK_CACHE_DIR above. */
export async function bdusRecord(tb: string, id: number | string): Promise<any> {
  const cacheKey = `record:${tb}:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const diskPath = diskCachePath(cacheKey);
  if (existsSync(diskPath)) {
    const promise = Promise.resolve(JSON.parse(readFileSync(diskPath, 'utf8')));
    cache.set(cacheKey, promise);
    return promise;
  }

  const promise = sharedBdusRecord(config, tb, id).then((data) => {
    mkdirSync(DISK_CACHE_DIR, { recursive: true });
    writeFileSync(diskPath, JSON.stringify(data), 'utf8');
    return data;
  });

  cache.set(cacheKey, promise);
  return promise;
}

/** Runs `tasks` with at most `concurrency` in flight at once. */
async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<any>): Promise<any[]> {
  const results: any[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/** A query in v5's own (native) shape — what finds-taxonomy.json and article embeds carry directly, no ShortSQL involved. */
export interface BdusQuery {
  tb: string;
  filter?: FilterNode;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  /** A second sort key, applied in JS (v5's list endpoint only accepts one `sort_field`) — e.g. bibliography's author-then-year. */
  sortField2?: string;
  limit?: number;
}

/**
 * Runs a query and returns FULL record detail for every match (the
 * preview/list endpoint doesn't include files or plugin data, which grids
 * and record pages both need for thumbnails/measures).
 */
export async function bdusQueryFull(query: BdusQuery): Promise<any[]> {
  const previews = await bdusListAll(query.tb, {
    filter: query.filter,
    sortField: query.sortField,
    sortDir: query.sortDir,
    limit: query.limit,
  });
  let records = await pool(previews, 10, (p) => bdusRecord(query.tb, p.id));

  if (query.sortField) {
    const primary = query.sortField;
    const dir = query.sortDir === 'desc' ? -1 : 1;
    records = [...records].sort((a, b) => {
      const av = a.core?.[primary]?.val ?? '';
      const bv = b.core?.[primary]?.val ?? '';
      const p = String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
      if (p !== 0 || !query.sortField2) return p;
      return String(a.core?.[query.sortField2]?.val ?? '').localeCompare(String(b.core?.[query.sortField2]?.val ?? ''));
    });
  }

  return records;
}

/** Full record detail for every row matching a raw filter object (e.g. a record's own `links.<tb>.filter`). */
export async function bdusFullByFilter(tb: string, filter: FilterNode): Promise<any[]> {
  const previews = await bdusListAll(tb, { filter });
  return pool(previews, 10, (p) => bdusRecord(tb, p.id));
}

/** Finds the single record matching `field = value` and returns its full detail (or null). */
export async function bdusFindOne(tb: string, field: string, value: string): Promise<any | null> {
  const matches = await bdusListAll(tb, { filter: { [field]: { _eq: value } }, limit: 1 });
  if (matches.length === 0) return null;
  return bdusRecord(tb, matches[0].id);
}

/** Public, unauthenticated URL for an uploaded file — same convention as the v4 site, new domain. */
export function bdusFileUrl(fileId: number | string, ext: string): string {
  return sharedBdusFileUrl('ghazni', fileId, ext);
}
