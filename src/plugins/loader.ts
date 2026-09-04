import { addSourceAttributes } from "../transform/index.js";

/** Webpack / Turbopack loader. Runs before SWC, only when the Crayon CLI is driving the dev server. */
export default function crayonLoader(this: any, source: string) {
  if (!process.env.CRAYON) return source;
  const file: string = this.resourcePath ?? "";
  if (!file || file.includes("node_modules")) return source;
  const root = process.env.CRAYON_ROOT || this.rootContext || process.cwd();
  const { code, map, count } = addSourceAttributes(source, file, root);
  if (count === 0) return source;
  if (typeof this.callback === "function") {
    this.callback(null, code, map ?? undefined);
    return;
  }
  return code;
}
