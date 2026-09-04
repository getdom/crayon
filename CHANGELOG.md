# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
