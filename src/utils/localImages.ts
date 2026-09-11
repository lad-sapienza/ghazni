/**
 * Resolves a BraDypUS file id to its LOCAL path under /images/bdus/ —
 * downloaded once by scripts/fetch-images.mjs (run before `astro build`,
 * see package.json), never hot-linked from the live site at runtime.
 *
 * Falls back to the "image not available" placeholder if the download
 * failed for that particular file (a handful of files 401 even with a
 * valid read key — access-restricted originals, presumably).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_IMG = '/images/css/image-not-available.jpg';

export function localFileUrl(fileId: number | string, ext: string): string {
  const filename = `${fileId}.${ext.toLowerCase()}`;
  // process.cwd(), not import.meta.url: the latter points at wherever the
  // bundler placed this module's compiled chunk, which moves around and is
  // not reliably project-root-relative once bundled for the build.
  const onDisk = join(process.cwd(), 'public/images/bdus', filename);
  return existsSync(onDisk) ? `/images/bdus/${filename}` : DEFAULT_IMG;
}
