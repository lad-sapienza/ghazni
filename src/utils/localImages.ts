/**
 * Resolves a BraDypUS file id to its LOCAL path under /images/bdus/ —
 * downloaded once by scripts/fetch-images.mjs (run before `astro build`,
 * see package.json), never hot-linked from the live site at runtime.
 *
 * Falls back to the "image not available" placeholder if the download
 * failed for that particular file (a handful of files 401 even with a
 * valid read key — access-restricted originals, presumably).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import probeSync from 'probe-image-size/sync';

const DEFAULT_IMG = '/images/css/image-not-available.jpg';

// process.cwd(), not import.meta.url: the latter points at wherever the
// bundler placed this module's compiled chunk, which moves around and is
// not reliably project-root-relative once bundled for the build.
function onDiskPath(filename: string): string {
  return join(process.cwd(), 'public/images/bdus', filename);
}

export function localFileUrl(fileId: number | string, ext: string): string {
  const filename = `${fileId}.${ext.toLowerCase()}`;
  return existsSync(onDiskPath(filename)) ? `/images/bdus/${filename}` : DEFAULT_IMG;
}

/** Pixel dimensions of a downloaded record image — the Gallery/lightbox component needs these to lay out without content shift. */
export function localFileDimensions(fileId: number | string, ext: string): { width: number; height: number } {
  const filename = `${fileId}.${ext.toLowerCase()}`;
  const path = onDiskPath(filename);
  if (existsSync(path)) {
    const result = probeSync(readFileSync(path));
    if (result) return { width: result.width, height: result.height };
  }
  return { width: 800, height: 600 }; // matches the placeholder image's own size
}
