import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli/index.ts", index: "src/index.ts", next: "src/plugins/next.ts", vite: "src/plugins/vite.ts" },
    format: ["esm"],
    platform: "node",
    target: "node20",
    dts: true,
    clean: true,
    shims: true,
  },
  {
    entry: { next: "src/plugins/next.ts", loader: "src/plugins/loader.ts" },
    format: ["cjs"],
    platform: "node",
    target: "node20",
    outExtension: () => ({ js: ".cjs" }),
    splitting: false,
    shims: true,
    footer: {
      js: `if (module.exports && typeof module.exports.default === "function") { const d = module.exports.default; Object.assign(d, module.exports); module.exports = d; }`,
    },
  },
  {
    entry: { overlay: "src/overlay/index.ts" },
    format: ["iife"],
    platform: "browser",
    target: "es2020",
    minify: false,
    outDir: "dist",
  },
]);
