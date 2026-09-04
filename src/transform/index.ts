import { parse } from "@babel/parser";
import MagicString from "magic-string";
import path from "node:path";

export const ATTR = "data-crayon";

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString["generateMap"]> | null;
  count: number;
}

export function parseSource(code: string, filename: string) {
  return parse(code, {
    sourceType: "module",
    sourceFilename: filename,
    errorRecovery: true,
    plugins: [
      "jsx",
      "typescript",
      "decorators-legacy",
      "importAttributes",
      "explicitResourceManagement",
    ],
  });
}

/** Walk every node of a Babel AST, depth first. `ancestors` is nearest-first. */
export function walk(node: any, visit: (node: any, parent: any, ancestors: any[]) => void, ancestors: any[] = []) {
  if (!node || typeof node.type !== "string") return;
  visit(node, ancestors[0] ?? null, ancestors);
  const next = [node, ...ancestors];
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "extra" || key === "leadingComments" || key === "trailingComments") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, next);
    } else if (value && typeof value.type === "string") {
      walk(value, visit, next);
    }
  }
}

export function isHostElement(opening: any): boolean {
  const name = opening?.name;
  if (!name || name.type !== "JSXIdentifier") return false;
  const first = name.name[0];
  return first === first.toLowerCase() && first !== first.toUpperCase();
}

export function toRelative(root: string, filename: string): string {
  const rel = path.relative(root, filename);
  return rel.split(path.sep).join("/");
}

/**
 * Add `data-crayon="rel/path.tsx:line:col"` to every host JSX element (div, p, img...).
 * Components are left untouched, since props on them never reach the DOM.
 */
export function addSourceAttributes(code: string, filename: string, root = process.cwd()): TransformResult {
  if (!/<[a-z]/.test(code)) return { code, map: null, count: 0 };
  let ast;
  try {
    ast = parseSource(code, filename);
  } catch {
    return { code, map: null, count: 0 };
  }
  const rel = toRelative(root, filename);
  const s = new MagicString(code);
  let count = 0;
  walk(ast, (node) => {
    if (node.type !== "JSXOpeningElement" || !isHostElement(node)) return;
    const already = node.attributes?.some(
      (a: any) => a.type === "JSXAttribute" && a.name?.name === ATTR,
    );
    if (already) return;
    const { line, column } = node.loc.start;
    const insertAt = node.typeArguments?.end ?? node.typeParameters?.end ?? node.name.end;
    s.appendLeft(insertAt, ` ${ATTR}="${rel}:${line}:${column}"`);
    count++;
  });
  if (count === 0) return { code, map: null, count: 0 };
  return { code: s.toString(), map: s.generateMap({ hires: true, source: filename }), count };
}

export function parseLocator(value: string): { file: string; line: number; column: number } | null {
  const m = /^(.*):(\d+):(\d+)$/.exec(value);
  if (!m) return null;
  return { file: m[1], line: Number(m[2]), column: Number(m[3]) };
}
