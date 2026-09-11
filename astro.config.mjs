import { defineConfig } from 'astro/config';
import rehypeSlug from 'rehype-slug';
import { unified } from '@astrojs/markdown-remark';
import { userConfig } from './src/user.config.mjs';
import { scms } from '@lad-sapienza/scms-core/scms';

export default defineConfig({
  site: userConfig.site,
  base: userConfig.base,
  output: 'static',

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
