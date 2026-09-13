/**
 * Renders a plain markdown string (from BraDypUS's `body` field on a blog
 * record) to HTML at build time, reusing Astro's own remark/rehype
 * pipeline (see astro.config.mjs) so output matches the rest of the site's
 * markdown-derived content — same heading-id plugin, etc.
 */
import { createMarkdownProcessor, type MarkdownRenderer } from '@astrojs/markdown-remark';
import rehypeSlug from 'rehype-slug';

let processor: Promise<MarkdownRenderer> | undefined;

export async function renderMarkdown(md: string | undefined | null): Promise<string> {
  if (!md) return '';
  processor ??= createMarkdownProcessor({ rehypePlugins: [rehypeSlug] });
  const result = await (await processor).render(md);
  return result.code;
}
