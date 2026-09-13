/**
 * Blog posts, fetched from BraDypUS's `blog` table at build time — unlike
 * the rest of the site's static text (src/content/articles), the blog is
 * meant to be edited by staff directly in BraDypUS, no git/MDX involved.
 * See README "Publishing a new blog post".
 */
import { bdusQueryFull } from './bdus';
import { renderMarkdown } from './markdown';

export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  summary?: string;
  author?: string;
  publishDate?: string;
  domain?: 'islamic' | 'buddhist';
  bodyHtml: string;
  /** First attached file — used as the post's cover image. */
  coverFile?: { id: number; ext: string };
  /** Every other attached image — rendered as a gallery below the post body. */
  galleryFiles: { id: number; ext: string; description?: string }[];
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

async function toBlogPost(record: any): Promise<BlogPost> {
  const core = record.core ?? {};
  const val = (name: string) => core[name]?.val;
  // `is_image` alone isn't reliable here — it's come back `false` for
  // legitimate webp uploads (see scripts/fetch-images.mjs) — so also
  // accept a recognized image extension.
  const files: any[] = (record.files ?? []).filter(
    (f: any) => f.is_image || IMAGE_EXTS.has(String(f.ext).toLowerCase())
  );
  return {
    id: record.id,
    slug: val('slug'),
    title: val('title'),
    summary: val('summary') || undefined,
    author: val('author') || undefined,
    publishDate: val('publish_date') || undefined,
    domain: (val('domain') || undefined) as 'islamic' | 'buddhist' | undefined,
    bodyHtml: await renderMarkdown(val('body')),
    coverFile: files[0] ? { id: files[0].id, ext: files[0].ext } : undefined,
    galleryFiles: files.slice(1).map((f) => ({ id: f.id, ext: f.ext, description: f.description })),
  };
}

/** Every published post, newest first. */
export async function listPublishedPosts(): Promise<BlogPost[]> {
  const records = await bdusQueryFull({
    tb: 'blog',
    filter: { status: { _eq: 'published' } },
    sortField: 'publish_date',
    sortDir: 'desc',
  });
  return Promise.all(records.map(toBlogPost));
}
