import { addSourceAttributes } from "../transform/index.js";

interface MinimalPlugin {
  name: string;
  enforce?: "pre" | "post";
  apply?: "serve" | "build";
  configResolved?: (config: { root: string }) => void;
  transform?: (code: string, id: string) => { code: string; map: any } | null | undefined;
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
