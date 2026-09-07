# Architecture

Crayon is one npm package with three runtimes: a Node CLI, a build plugin loaded by the user's bundler, and a browser script injected into the page. They share the transform and writer code.

## The problem

To edit a rendered element and change the right source, you need a mapping from a DOM node to a file and a position. React 19 removed `_debugSource` from fibers, and production-oriented tooling never had it, so the mapping has to be created at build time.

## 1. Tagging: `data-crayon="file:line:col"`

`src/transform/index.ts` parses a `.tsx`/`.jsx` file with `@babel/parser` (jsx + typescript plugins, error recovery on) and, for every `JSXOpeningElement` whose name starts with a lowercase letter, inserts an attribute right after the element name:

```tsx
<section className="p-4">        →  <section data-crayon="app/page.tsx:12:4" className="p-4">
```

`magic-string` makes the insertion without reprinting the file, and produces a source map so error overlays keep pointing at the right lines. Components (`<Button>`) are not tagged: props on them do not reach the DOM.

The transform is exposed three ways:

- `src/plugins/loader.ts`: a webpack-style loader. Turbopack accepts the same loader shape through `turbopack.rules`. It runs with `enforce: "pre"` so it sees the original TSX, before SWC.
- `src/plugins/next.ts`: `withCrayon(config)` adds that loader to both `webpack` and `turbopack.rules`. Note: no `as` option on the Turbopack rule, it makes Turbopack look for `page.tsx.tsx`.
- `src/plugins/vite.ts`: a `transform` hook with `enforce: "pre"`, `apply: "serve"`.

All three check `process.env.CRAYON` and return the source untouched when it is unset. The CLI sets `CRAYON=1` and `CRAYON_ROOT=<project>` when spawning the dev server, so paths in the attribute are relative to the project root.

## 2. The CLI and the proxy

`src/cli/index.ts` runs in this order:

1. `detect.ts`: read `package.json`, decide Next / Vite / static, pick the package manager from lockfiles, build the dev command (`npm run dev` when a `dev` script exists, else `npx next dev` or `npx vite`), find the config file.
2. `setup.ts`: make `crayon-dev/next` resolvable from the project (symlink when the CLI runs from a checkout, `<pm> add -D crayon-dev` otherwise) and patch the config with a regex on `export default X` / `module.exports = X` / `plugins: [`. Asks first unless `--setup`.
3. `devserver.ts`: spawn the dev command with `execa`, mirror its output with a `│` prefix, and resolve as soon as a `http://localhost:<port>` URL appears in stdout or stderr.
4. `proxy.ts`: an `http-proxy` in front of the dev server, listening on 4400 or the next free port.
   - `accept-encoding` is stripped from upstream requests so HTML comes back uncompressed; if it does not, gzip/deflate/brotli are decoded anyway.
   - HTML responses are buffered, `<script src="/__crayon/overlay.js" defer>` is inserted before `</head>`, CSP headers are dropped, `content-length` is recomputed. Everything else is piped through.
   - Websocket upgrades on `/__crayon/ws` go to Crayon's own server; all others (Next HMR, Vite HMR) are forwarded to the dev server.
5. `edits.ts`: an `EditSession` that applies edits through the writer, logs them, and keeps an undo stack of file snapshots.

On SIGINT the proxy closes and the child is killed with SIGTERM, then SIGKILL after 3 s.

## 3. The overlay

`src/overlay/index.ts` is bundled as an IIFE with no dependencies and mounted in a Shadow DOM so the site's CSS cannot touch it and vice versa. It has three parts:

- **Toolbar**: connection dot, status line, Undo, Editing/Browsing toggle. The status has a fixed width so buttons do not move while messages change.
- **Hover box**: a fixed-position outline drawn from `getBoundingClientRect()`, redrawn on scroll and resize, with a tag showing `tag · file:line` from the nearest `data-crayon`.
- **Editing**: clicks are captured in the capture phase while editing is on. The target is the clicked element if it is text-only (no child elements, non-empty text), otherwise the deepest text-only descendant under the pointer. `contentEditable="plaintext-only"` is set, the text selected, and Enter / Esc / blur commit or cancel. On commit the overlay sends `{ file, line, column, ancestors, oldText, newText }` where `ancestors` is the list of `data-crayon` values up the DOM, nearest first.

After a successful write the dev server's HMR re-renders. Because the DOM already shows the new text, the user sees no change.

## 4. The writer

`src/writer/index.ts` turns an edit into one `magic-string` overwrite.

**Locate at position.** Parse the file named in the locator, find the `JSXElement` whose opening tag starts at that line and column, and list its editable slots: `JSXText` children, `{"string"}` and ``{`template`}`` children. If a slot's rendered text equals the DOM text after normalisation, that is the target.

**Search by text.** Otherwise the text came through a component or a prop. Every source file (skipping `node_modules`, `.next`, `dist`, ...) is parsed and every literal is classified:

| Tier | Where the literal sits                                                                                     | Example                                          |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1    | JSX text or string child                                                                                   | `<Button>Book</Button>`                          |
| 2    | JSX attribute (excluding `className`, `href`, `id`, `data-*`, handlers...) or inside a JSX expression      | `<Field label="Surface">`, `{ok ? "Yes" : "No"}` |
| 3    | Any other string literal, excluding imports, object keys, `cn()`/`clsx()` arguments, comparisons, TS types | `const nav = [{ label: "Pricing" }]`             |

The lowest tier with hits is kept. One hit is the answer. Several hits are narrowed with the DOM ancestors: prefer hits in the file of the nearest ancestor, then the closest line at or after that ancestor's line. If that still leaves several, the edit is refused as ambiguous with the list of candidates. No hits at all is refused as "computed", with the file and line that rendered the element.

**Rewrite.** JSX text keeps its leading and trailing whitespace and gets `<`, `>`, `{`, `}` encoded as entities. String literals keep their quote style. Template literals escape backticks and `${`. Newlines typed in the page become spaces.

`renderJsxText` in `jsx-text.ts` reproduces Babel's `cleanJSXElementLiteralChild` so that source text and DOM text normalise to the same string.

## 5. Images, styles, content files, plain HTML

- **Images** (`src/cli/images.ts`): the DOM `src` is decoded (`/_next/image?url=…`, `/_next/static/media/name.hash.ext`, `/public/path`, remote URL). Public paths: the element owning `src="<literal>"` is located with `src/writer/attrs.ts` (position first, then attribute search with ancestor tie-break), the file is written next to the current one, `src`/`alt`/`height` are rewritten in one MagicString pass. Imported assets: the file is overwritten on disk, same name. Paths living in content files are updated there. Every write records file snapshots so Undo can delete created files and restore overwritten ones.
- **Styles** (`src/writer/classes.ts`, `src/cli/theme.ts`): the overlay stages class swaps while editing, previews them with inline styles, and sends `{remove, add}` on commit. The writer collects every string literal under the `className` attribute (plain, template quasis, `cn()`/`clsx()` arguments, ternaries), removes tokens where found, adds new ones to the first literal, and reports tokens it could not find. The palette comes from `node_modules/tailwindcss/theme.css` plus the project's `@theme` blocks (v4) or `tailwindcss/colors` plus the config (v3); the overlay resolves `var(--x)` values against `:root` for accurate swatches.
- **Content files** (`src/writer/data.ts`): JSON string values, YAML scalars and markdown frontmatter, matched exactly. Quoting is preserved and re-applied where YAML needs it.
- **Expression paths**: when the located element renders `{dict.hero.title}` or `{t("hero.title")}`, the property path is compared with the object-key path of every tier-3 literal; a single match wins over the tier order.
- **Plain HTML** (`src/static/`): `parse5` with source positions tags elements at serve time; text, attribute and class edits use the same positions. The static server resolves clean URLs (`/about` → `about.html` or `about/index.html`).

## 6. Mixed content and Publish

- **Mixed content** (`src/writer/composite.ts`, `applyHtmlCompositeEdit`): the overlay serialises the edited element as parts, text or `{ tag, locator, text }`. The writer takes the element at the locator (or, when the element is rendered by a component, the parent of a tagged child), checks that every original child is static (text, string literal, inline host element), then rebuilds the children region: text parts encoded, element parts copied from their original source with only their inner text replaced. A part it cannot map back is a refusal, never a guess.
- **Publish** (`src/cli/git.ts`): the session keeps the list of files it wrote and a one-line summary per edit. Publish runs `git add` on those files only, `git commit` with a title and a bulleted body, then `git push` when `@{u}` exists. It uses the repository's git identity and adds no trailer. On success the pending list and the undo stack are cleared; undoing across a commit would silently diverge from what was pushed.

## 7. Plain CSS

`src/writer/css.ts` is a small CSS reader: top-level and nested rules (`@media`, `@supports`, `@layer`, `@container`) with their declarations and offsets. To change a property on an element, the overlay sends the tag, id and classes; the writer keeps every rule whose last compound matches (pseudo-classes and pseudo-elements excluded, so `:hover` rules are never touched), ranks base rules above nested ones, then by specificity, then by source order, and either rewrites the value of the existing declaration (shorthand `background` counts for `background-color`, `!important` is kept) or appends `prop: value;` to the best class rule with the file's indentation. The theme endpoint exposes the `:root` custom properties so the swatches offer `var(--name)` first.

## Why these choices

- **TypeScript everywhere.** Bundler loaders and Vite plugins are JavaScript by construction, Babel is the reference parser for JSX, and the user already has Node. A Go or Rust binary would add an install step and gain nothing: parsing one file takes milliseconds.
- **Proxy instead of a browser extension.** Works in any browser, no install, and an extension would still need a local process to write files.
- **No LLM in the write path.** Edits must be instant and predictable. An agent fallback for computed text is on the table, as a separate, opt-in step.
