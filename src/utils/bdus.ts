/**
 * Minimal BraDypUS v5 API client.
 *
 * Build-time only: every call here runs inside Astro frontmatter / getStaticPaths
 * while `astro build` is running in Node, never in the browser. The API key
 * (BDUS_API_KEY, read-only privilege) therefore never reaches the client
 * bundle — see README "Updating the site" for why this matters for a fully
 * static, GitHub Pages–hosted site.
 */
import type { FilterNode } from './shortsql.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// import.meta.env when Vite processes this (Astro pages/components); plain
// process.env when scripts/fetch-images.mjs imports it directly via Node.
const env: Record<string, string | undefined> = { ...process.env, ...import.meta.env };
const BASE_URL = env.BDUS_BASE_URL ?? 'https://bdus.lad-sapienza.it/ghazni';
const API_KEY = env.BDUS_API_KEY;
const MAX_PER_PAGE = 200;

if (!API_KEY) {
  throw new Error(
    'BDUS_API_KEY is not set. Copy .env.example to .env and fill in a read-only API key for the `ghazni` app (see README).'
  );
}

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

async function bdusFetch(path: string, init?: RequestInit): Promise<any> {
  const cacheKey = `${path}:${init?.body ?? ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const diskPath = diskCachePath(cacheKey);
  if (existsSync(diskPath)) {
    const promise = Promise.resolve(JSON.parse(readFileSync(diskPath, 'utf8')));
    cache.set(cacheKey, promise);
    return promise;
  }

  const promise = (async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`BraDypUS API ${path} -> HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    if (data.status === 'error') {
      throw new Error(`BraDypUS API ${path} -> ${data.code ?? 'error'}: ${data.detail ?? ''}`);
    }
    mkdirSync(DISK_CACHE_DIR, { recursive: true });
    writeFileSync(diskPath, JSON.stringify(data), 'utf8');
    return data;
  })();

  cache.set(cacheKey, promise);
  return promise;
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
  const rows: any[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const body = {
      per_page: MAX_PER_PAGE,
      page,
      ...(opts.filter ? { filter: opts.filter } : {}),
      ...(opts.sortField ? { sort_field: opts.sortField, sort_dir: opts.sortDir ?? 'asc' } : {}),
    };
    const data = await bdusFetch(`/api/records/${tb}`, { method: 'POST', body: JSON.stringify(body) });
    rows.push(...data.data);
    if (rows.length >= data.total || data.data.length === 0) break;
    page++;
  }
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

/** Fetches the full nested record (core/plugins/files/schema) by internal numeric id. */
export async function bdusRecord(tb: string, id: number | string): Promise<any> {
  return bdusFetch(`/api/record/${tb}/${id}`);
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
  return `https://bdus.lad-sapienza.it/projects/ghazni/files/${fileId}.${ext}`;
}
