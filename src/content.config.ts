/**
 * Content Collections Configuration
 *
 * Define your content collections here. Each collection needs a loader
 * (usually `glob` for local Markdown/MDX files) and a Zod schema.
 *
 * Fastest way to add one: `npm run add-collection`.
 *
 * Example — a `blog` collection, added to the `collections` export below:
 *
 * const blog = defineCollection({
 *   loader: glob({ pattern: '**\/*.{md,mdx}', base: './src/content/blog' }),
 *   schema: z.object({
 *     title: z.string(),
 *     description: z.string(),
 *     date: z.coerce.date(),
 *     draft: z.boolean().optional(),
 *   }),
 * });
 */

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

// Export all collections
export const collections = {};
