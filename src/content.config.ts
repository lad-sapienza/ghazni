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

// Blog posts, split into their own collection/folder (see README "Publishing
// a new blog post") so staff have one unambiguous place to add a post,
// instead of an `articles` entry that only counts as a post if it remembers
// a "blog" tag. `tags` isn't needed here — collection membership itself is
// what makes a post a post — but a `[textid].astro` catch-all still renders
// blog posts at their own bare /{textid} URL too (the original PHP site did
// the same), reusing the same ArticlePage component as `articles`, so it
// still expects a `tags` array on every entry it renders — defaults to `[]`.
const blog = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/blog' }),
  schema: z.object({
    id: z.number(),
    textid: z.string(),
    title: z.string(),
    summary: z.string().optional(),
    author: z.string().optional(),
    publish: z.string().optional(),
  }),
});

export const collections = { articles, blog };
