import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defineConfig } from 'astro/config';
import rehypeSlug from 'rehype-slug';
import { unified } from '@astrojs/markdown-remark';
import { userConfig } from './src/user.config.mjs';
import { scms } from '@lad-sapienza/scms-core/scms';

// Every finds-taxonomy node used to also have a static article at its own
// bare `/{node_id}` URL (a routing quirk of the original PHP site, kept for
// URL compatibility — see src/pages/[textid].astro). Those intros now live
// in BraDypUS's `finds_categories` table instead (see
// src/utils/findsCategories.ts) and render only at their canonical nested
// path via CategoryPage.astro, so the bare URL becomes a redirect to that
// canonical path — old links/bookmarks/search results still resolve.
// Excludes each domain's own root node (e.g. "islamic"), which is a real,
// different page (src/pages/[domain]/index.astro), not a taxonomy container.
const __dirname = dirname(fileURLToPath(import.meta.url));
const taxonomy = JSON.parse(readFileSync(join(__dirname, 'src/data/finds-taxonomy.json'), 'utf8'));

const taxonomyRedirects = {};
for (const [domain, root] of Object.entries(taxonomy.finds)) {
  (function walk(node, parts) {
    if (typeof node.id === 'string' && parts.length > 0) {
      taxonomyRedirects[`/${node.id}`] = `/${domain}/finds/${parts.join('/')}`;
    }
    if (node.items) {
      for (const [key, child] of Object.entries(node.items)) walk(child, [...parts, key]);
    }
  })(root, []);
}

export default defineConfig({
  site: userConfig.site,
  base: userConfig.base,
  output: 'static',
  redirects: taxonomyRedirects,

  // rehypeSlug adds an id to every heading, which the TableOfContents
  // component relies on for its anchor links.
  markdown: {
    processor: unified({ rehypePlugins: [rehypeSlug] }),
  },

  integrations: [
    ...scms(),
    ...(userConfig.integrations || []),
  ],

  vite: {
    ...(userConfig.vite || {}),
  },
});
