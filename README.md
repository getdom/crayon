# Crayon

Edit your site on the rendered page. Crayon writes the change straight into your code.

Built for sites that came out of Lovable, v0, Bolt, Cursor or Claude Code: changing a headline should not require another prompt, a two-minute rebuild and a regression.

```bash
cd my-next-site
npx crayon-dev
```

Crayon starts your dev server, opens the site with a thin toolbar, and every piece of text becomes editable in place. Press Enter, the source file is updated. Nothing else in the file moves.

## What it does today

- **Next.js** (webpack and Turbopack) and **Vite** projects, React 18 and 19, server and client components.
- Click any text, type, Enter. The JSX literal is replaced in the right file, with indentation and formatting untouched.
- Text that reaches the DOM through a component (`<Button>Book now</Button>`) is found by a unique text search across the project.
- Undo from the toolbar.
- Clear messages when the text cannot be edited safely: it comes from data, props or a CMS, or it appears several times.

## What it does not do yet

Images, Tailwind tokens (colour, size, spacing), plain HTML sites, and a Publish button that commits and pushes. That is the roadmap, in that order. Crayon will never do drag-and-drop layout.

## How it works

1. A one-line plugin in your `next.config` or `vite.config` tags every host element with `data-crayon="file:line:column"` in development. The plugin is inert unless the Crayon CLI started the dev server, so it is safe to commit.
2. The CLI runs your usual `dev` script, puts a proxy in front of it that injects the overlay, and listens for edits over a websocket.
3. Each edit is applied with a surgical AST rewrite (Babel parser + magic-string): the matching text node is replaced, the rest of the file is byte-for-byte identical. Your dev server's HMR does the rest.

```ts
// next.config.ts
import { withCrayon } from "crayon-dev/next";
export default withCrayon(nextConfig);

// vite.config.ts
import { crayon } from "crayon-dev/vite";
export default defineConfig({ plugins: [react(), crayon()] });
```

The CLI offers to add that line for you on first run.

## Options

```
npx crayon-dev [dir] [--port 4400] [--no-open] [--setup]
```

`--setup` patches the framework config without asking. `⌘E` in the page toggles between editing and browsing.

## Development

```bash
npm install
npm test
npm run build
node dist/cli.js ../some-next-project
```

MIT.
