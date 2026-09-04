# Contributing to Crayon

Thanks for looking. Crayon is small on purpose, and the most valuable contributions are real-world reports: a site where an edit lands in the wrong place, a framework setup that is not detected, a text that should be editable and is refused.

## Dev setup

```bash
git clone https://github.com/getdom/crayon
cd crayon
npm install
npm test          # vitest
npm run build     # tsup → dist/
npm link          # makes the `crayon` command point at this checkout
```

Then in any Next or Vite project:

```bash
cd ../some-site
crayon
```

When run from a local checkout, the CLI symlinks itself into the project's `node_modules` instead of installing from npm, so the plugin resolves to your working copy. Rebuild (`npm run build`) and restart `crayon` to pick up changes. `npm run dev` in the Crayon repo rebuilds on every change.

Requirements: Node 20 or later.

## Layout

```
src/
  cli/          the `crayon` command
    index.ts      argument parsing, orchestration, shutdown
    detect.ts     framework, package manager, dev command, config file
    setup.ts      install the package into the project, patch the config
    devserver.ts  spawn the dev script, wait for its URL
    proxy.ts      HTTP proxy, overlay injection, websocket for edits
    edits.ts      edit session: apply, log, undo history
  transform/    add data-crayon="file:line:col" to host JSX elements (Babel parser + magic-string)
  writer/       locate a text in the source and rewrite one literal
    index.ts      locateTextEdit / applyTextEdit, tiered search, expression paths, ancestor tie-break
    jsx-text.ts   JSX whitespace rules, entities, normalisation
    attrs.ts      locate an element by attribute, rewrite attributes
    classes.ts    swap Tailwind tokens inside className (plain, template, cn())
    data.ts       JSON / YAML / frontmatter values
    substring.ts  word-level match inside a text
  static/       plain HTML sites: parse5 tagging, edits, file server
  cli/images.ts, cli/theme.ts   image replacement, Tailwind palette and fonts
  scripts/      demo.mjs + gif.py record the README demo
  plugins/
    loader.ts     webpack / Turbopack loader (CJS)
    next.ts       withCrayon(nextConfig)
    vite.ts       crayon() Vite plugin
  overlay/      the script injected in the page (vanilla TS, Shadow DOM, no framework)
test/           vitest, fixtures written to a temp dir
```

Three things are worth reading before changing behaviour:

- `src/writer/jsx-text.ts` mirrors how React collapses JSX whitespace. The DOM text and the source text must normalise to the same string or nothing matches.
- `src/writer/index.ts` `literalTier` decides which string literals count as user-facing copy. Adding a false positive there makes Crayon edit a `className` or a route; be conservative.
- `src/transform/index.ts` only tags host elements. Props on components never reach the DOM, so tagging them would be noise.

## Testing on a real site

Unit tests cover the writer and the transform. The proxy, the loader and the overlay are tested by hand on real projects. Before opening a PR that touches them, run Crayon on at least one Next project and check:

1. Hovering shows the tag with the right file and line.
2. Editing a plain `<h1>` text writes the file and HMR re-renders without a flash.
3. Editing a text passed through a component (`<Button>Text</Button>`) lands in the parent file.
4. Undo restores the file.
5. Ctrl+C stops both Crayon and the dev server.

Add the project's framework and version to your PR description.

## Pull requests

- One change per PR. Small PRs get merged, large ones get discussed first in an issue.
- Add a test for anything in `writer/` or `transform/`. Fixtures are inline strings written to a temp dir, see `test/writer.test.ts`.
- `npm run typecheck && npm test && npm run build` must pass. CI runs the same on Node 20, 22 and 24.
- Keep the user-facing messages in the overlay and the terminal short and specific. A message should say what happened and what to do next.
- No new runtime dependencies without a reason in the PR. The overlay must stay dependency-free.

## Reporting a bug

Use the bug template. The most useful report contains: framework and version, the dev command, the JSX around the text you clicked, what Crayon printed in the terminal, and what it printed in the toolbar.

## Scope

Crayon edits content. Text now, images and Tailwind tokens next, then plain HTML and a publish button. It will not become a layout or design tool. PRs in that direction will be declined kindly.

## License

By contributing you agree that your contributions are licensed under the MIT license.
