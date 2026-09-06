import path from "node:path";
import { addSourceAttributes } from "../transform/index.js";
import { tagHtml } from "../static/html.js";

interface MinimalPlugin {
  name: string;
  enforce?: "pre" | "post";
  apply?: "serve" | "build";
  configResolved?: (config: { root: string }) => void;
  transform?: (code: string, id: string) => { code: string; map: any } | null | undefined;
  /** Vanilla Vite sites: the page itself is an HTML file, tagged from the HTML parser's positions. */
  transformIndexHtml?: { order: "pre"; handler: (html: string, ctx: { filename: string }) => string };
}

/** Vite plugin: `plugins: [react(), crayon()]`. Inert unless the Crayon CLI is running. */
export function crayon(): MinimalPlugin {
  let root = process.cwd();
  return {
    name: "crayon",
    enforce: "pre",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (!process.env.CRAYON || !ctx.filename) return html;
        const rel = path.relative(root, ctx.filename).split(path.sep).join("/");
        return tagHtml(html, rel);
      },
    },
    transform(code, id) {
      if (!process.env.CRAYON) return null;
      const file = id.split("?")[0];
      if (file.includes("node_modules") || !/\.[jt]sx$/.test(file)) return null;
      const r = addSourceAttributes(code, file, root);
      return r.count ? { code: r.code, map: r.map } : null;
    },
  };
}

export default crayon;
