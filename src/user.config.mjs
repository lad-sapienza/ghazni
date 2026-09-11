/**
 * Site Configuration
 *
 * Edit this file to configure your site's metadata, integrations, and more.
 */

export const userConfig = {
  // Site URL (required for sitemap and canonical URLs)
  site: 'https://ghazni.bdus.cloud',

  // Base path (if deploying to a subdirectory, e.g. GitHub Pages project sites)
  // base: '/my-site',

  // Additional Astro integrations (merged with scms()'s own)
  integrations: [
    // Add your custom integrations here
  ],

  // Custom Vite configuration
  vite: {
    // Your custom Vite config
  },
};

/**
 * Site Metadata
 *
 * Used throughout the site for SEO, social media cards, and general info.
 */
export const siteMetadata = {
  title: 'Ghazni',
  description: 'Buddhist and Islamic Archaeological Data from Ghazni, Afghanistan. A multidisciplinary digital archive for the managing and preservation of an endangered cultural heritage.',
  author: 'Julian Bogdani',
};
