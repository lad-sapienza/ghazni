import { getCollection } from 'astro:content';

/**
 * Every statically-authored entry reachable at a bare /{textid} URL — both
 * `articles` and `blog` posts. The original PHP site served blog posts at
 * flat top-level slugs too (verified against the live legacy site), in
 * addition to /blog/{textid}, so [textid].astro needs this union rather
 * than just `articles`. Blog entries get a `tags: []` shim since they no
 * longer carry that field (see content.config.ts) but the shared
 * ArticlePage component still reads it.
 */
export async function getAllTextidPages() {
  const [articles, posts] = await Promise.all([getCollection('articles'), getCollection('blog')]);
  return [...articles, ...posts.map((p) => ({ ...p, data: { ...p.data, tags: [] as string[] } }))];
}
