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
  }),
});

export const collections = { articles };
