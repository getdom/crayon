# Troubleshooting

## "This text is not written as-is in the code (rendered by file.tsx:42)"

The text you clicked is computed: a formatted number, a date, a value from an API, a CMS field, an i18n key, or a string built with a template. Crayon only edits literals it can find verbatim. The message names the file and line that renders the element, so you know where to look.

## "This text appears N times in the code"

The same string exists in several files and the DOM ancestors were not enough to pick one. The candidates are listed in the terminal. Edit the right one in your editor, or make the strings differ.

## "No plain text here. Click directly on a piece of text."

You clicked an element that contains other elements, and no text-only element was under the pointer. Click the word itself, not the box around it.

## Hovering shows no outline, nothing is tagged

The page was served without the plugin. Causes, in order of likelihood:

1. The dev server was started with `npm run dev` instead of `npx crayon-dev`. The plugin is inert unless the CLI sets `CRAYON=1`.
2. The config line is missing. Check that `next.config.*` exports `withCrayon(...)` or that `vite.config.*` includes `crayon()` in `plugins`.
3. A custom `webpack` function in `next.config` replaces `config.module.rules`. `withCrayon` pushes its loader before calling yours; keep the rules array.
4. The file is `.js` with JSX inside. Only `.tsx` and `.jsx` are transformed by the Next loader.

## Turbopack: "Module not found: Can't resolve './page.tsx.tsx'"

You are on a Crayon version that set the `as` option on the Turbopack rule. Update Crayon. If you wrote the rule by hand, remove `as`.

## Port 4400 is busy

Crayon picks the next free port and prints it. Pass `--port` to choose. A previous Crayon that did not exit cleanly can hold the port: `lsof -i :4400` shows it.

## The dev server prints a URL but Crayon never says "ready"

Crayon waits for a `http://localhost:<port>` line on stdout or stderr, up to 90 s. Dev scripts that print only `0.0.0.0` or an IP are matched too. If your script prints nothing, run `next dev` or `vite` directly as the `dev` script.

## The site's links do not work while Crayon is open

That is editing mode: clicks are captured. Press ⌘E / Ctrl+E to switch to browsing, or ⌘-click / Ctrl-click a link.

## A hydration warning mentions `data-crayon`

The attribute is added at build time on both server and client, so it does not cause mismatches by itself. Warnings that list `data-crayon` next to an attribute injected by a browser extension (`data-atm-ext-installed`, Grammarly, password managers) come from that extension.

## Undo did nothing

Undo reverts Crayon's writes only, most recent first, for the current session. Edits made in your editor are not on that stack.

## Text with `&nbsp;`, `&amp;`, typographic quotes

Entities are decoded on both sides before comparing, and the common French and English ones are covered. If a text with an unusual entity is refused as computed, open an issue with the JSX line.

## The style bar does not show, or says "Styles live in the component"

The bar needs Tailwind in the project. When the text you clicked is rendered by a component (`<Button>`), its classes live in that component's file; Crayon does not guess which one. Open the component and click a text inside it instead, or edit the class in your editor.

## "This element's styles come from a CSS module"

The `className` is `styles.something`, not Tailwind classes. Change the CSS rule in the module file.

## Image replaced but the page still shows the old one

Content files (frontmatter, JSON) are read at request time, so Crayon reloads the page after such a change. For imported assets Next needs a moment to rebuild the hashed URL; if it stays stale, reload.

## Next 16: pages 404 or `proxy.ts` is skipped after adding Crayon

Fixed in 0.2.0: the plugin used to add a `webpack` config next to the Turbopack rules. Update Crayon.

## The Publish button is missing

It appears only inside a git repository and once Crayon has written something. If the project is not under git, initialise it first.

## Publish says "No remote branch to push to"

The commit was made locally; the branch has no upstream. Push it once from the terminal (`git push -u origin <branch>`) and the next Publish will push by itself.

## Publish fails on push

The message shows git's last line: usually authentication or a rejected non-fast-forward. Pull or authenticate in the terminal, then Publish again; the commit is already made and will be pushed.
