# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-09-04

### Added

- Images: click an image to replace it from a file, a drop or a URL, and edit its alt text. Files go next to the current one in `public/`; imported assets are replaced in place; `height` is corrected when the ratio changes. Drop a file straight onto an image.
- Style bar on Tailwind projects: size, weight, italic, text colour, font family. Palette and fonts are read from the project (Tailwind 4 `@theme` and `theme.css`, Tailwind 3 `tailwindcss/colors` and config). Works inside `cn()`/`clsx()`.
- Plain HTML sites: `npx crayon-dev` in a folder with `index.html` serves it with the overlay, no plugin needed.
- Content files as a search tier: JSON values, YAML, and markdown frontmatter, for text and image paths.
- Expression-path matching: `{dict.hero.title}` finds `hero: { title }` in the i18n dictionary rather than a same-looking literal elsewhere.
- Word-level edits inside a longer text, for sites that split sentences into spans.
- `scripts/demo.mjs` records the README demo with Puppeteer.

### Fixed

- Next 16: the plugin no longer adds a `webpack` config when Turbopack is in use, which broke `proxy.ts` on some projects.
- Editing an element containing non-breaking spaces no longer produces a spurious write.
- The toolbar no longer shifts when its status text changes.

## [0.1.0] - 2026-09-04

First release.

### Added

- `npx crayon-dev`: detects Next.js or Vite, runs the project's dev script, serves it through a proxy that injects the editing overlay.
- Self-setup on first run: adds `crayon-dev` as a dev dependency and wraps `next.config` with `withCrayon` or adds `crayon()` to Vite plugins. Both are inert without the CLI.
- Build-time tagging of host JSX elements with `data-crayon="file:line:col"` for webpack, Turbopack and Vite.
- In-place text editing: click, type, Enter. Esc cancels, clicking elsewhere saves, ⌘E toggles editing and browsing.
- Writer that replaces one literal by AST position, with a tiered text search fallback for copy passed through components, props and JSX expressions, and DOM-ancestor tie-breaking for repeated strings.
- Undo of the session's writes from the toolbar.
- Clear refusals for computed, ambiguous and composite text, with file and line.
- Falls back to the next free port when 4400 is taken.
