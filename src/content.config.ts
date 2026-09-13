import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

// Static article content, migrated from the original site's sqlite `articles`
// table. `textid` is the original slug and also the site path the article is
// served at (e.g. textid "ghazni-project" -> /ghazni-project) — kept as-is
// to preserve the old site's URLs.
const articles = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/articles' }),
  schema: z.object({
    id: z.number(),
    textid: z.string(),
    title: z.string(),
    summary: z.string().optional(),
    tags: z.array(z.string()).default([]),
    author: z.string().optional(),
    publish: z.string().optional(),
    /** Original CMS's manual ordering, for tag-filtered listings (e.g. the domain index's "Sites and buildings" tiles). */
    sort: z.number().default(0),
  }),
});

// Blog posts are NOT a content collection — they live in BraDypUS's `blog`
// table and are fetched at build time, same as finds/records. See
// src/utils/blog.ts and README "Publishing a new blog post".

export const collections = { articles };
