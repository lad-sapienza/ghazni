# Ghazni

Buddhist and Islamic Archaeological Data from Ghazni, Afghanistan. A multidisciplinary digital archive for the managing and preservation of an endangered cultural heritage.

Built with [s:CMS](https://github.com/lad-sapienza/scms-core), on top of [Astro](https://astro.build).

## Commands

| Command | Action |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the local dev server at `localhost:4321` |
| `npm run build` | Build the production site to `./dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run add-collection` | Scaffold a new content collection |
| `npm run add-content` | Add a new content file to an existing collection |

## Updating the framework

```bash
npm update @lad-sapienza/scms-core
```

## Project structure

```
src/
  content.config.ts     # Content collection schemas
  user.config.mjs        # Site configuration and metadata
  pages/                  # Routes
  layouts/                 # Layouts
  styles/global.css         # Stylesheet
public/                   # Static assets, served as-is
astro.config.mjs          # Registers the scms() integration
```

See the [s:CMS documentation](https://github.com/lad-sapienza/sCMS) for available components (`DataTb`, `Map`, `Gallery`, `ZoteroGeoViewer`, `Record`, and more).
