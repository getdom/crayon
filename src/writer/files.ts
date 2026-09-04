import fs from "node:fs";
import path from "node:path";

export const SOURCE_EXT = new Set([".tsx", ".jsx", ".ts", ".js", ".mjs", ".mdx"]);
export const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "out",
  ".turbo",
  ".vercel",
  "coverage",
]);

export function listFiles(root: string, keep: (name: string) => boolean, maxDepth = 8): string[] {
  const out: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(full, depth + 1);
      } else if (keep(entry.name)) {
        out.push(full);
      }
    }
  };
  visit(root, 0);
  return out;
}

export function listSourceFiles(root: string): string[] {
  return listFiles(root, (name) => SOURCE_EXT.has(path.extname(name)) && !name.endsWith(".d.ts"));
}
