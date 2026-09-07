import fs from "node:fs";
import path from "node:path";
import { parseSource, walk } from "../transform/index.js";
import { locateTextEdit, type TextEdit } from "./index.js";
import { updateAttributes, attrLiteral } from "./attrs.js";

export interface ComponentProps {
  ok: true;
  /** The JSX element in the parent file, e.g. <Button variant="outline">. */
  file: string;
  line: number;
  column: number;
  component: string;
  /** Where the component is defined, when found. */
  definition?: string;
  /** Prop name → allowed values, read from the component's cva() variants. */
  options: Record<string, string[]>;
  /** Prop name → current literal value, when set. */
  current: Record<string, string>;
}

/** The JSX element whose children contain the located text slot, plus the file. */
function elementAround(root: string, edit: TextEdit): { abs: string; el: any } | null {
  const located = locateTextEdit(root, edit);
  if (!located.ok || located.how === "data") return null;
  const abs = located.slot.file;
  const code = fs.readFileSync(abs, "utf8");
  const ast = parseSource(code, abs);
  let found: any = null;
  walk(ast, (node) => {
    if (found || node.type !== "JSXElement") return;
    if (
      node.children.some(
        (c: any) =>
          c.start === located.slot.start ||
          (c.type === "JSXExpressionContainer" && c.expression?.start === located.slot.start),
      )
    )
      found = node;
  });
  return found ? { abs, el: found } : null;
}

/** Resolve an import specifier to a file, handling relative paths and the `@/` alias. */
function resolveImport(root: string, fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else if (spec.startsWith("@/") || spec.startsWith("~/")) {
    const rel = spec.slice(2);
    base = [path.join(root, "src", rel), path.join(root, rel)].find((p) => exists(p)) ?? path.join(root, "src", rel);
  } else return null;
  return exists(base);
}

function exists(base: string): string | null {
  for (const cand of [
    base,
    base + ".tsx",
    base + ".ts",
    base + ".jsx",
    base + ".js",
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

/** Variant groups declared with cva() in a component file: { variant: [...], size: [...] }. */
export function variantsOf(code: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const m = /variants\s*:\s*\{/.exec(code);
  if (!m) return out;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < code.length && depth > 0) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
    i++;
  }
  const block = code.slice(start, i - 1);
  // groupName: { key: ..., key: ... }
  const groupRe = /([A-Za-z_$][\w$]*)\s*:\s*\{/g;
  let g: RegExpExecArray | null;
  while ((g = groupRe.exec(block))) {
    let j = g.index + g[0].length;
    let d = 1;
    const s = j;
    while (j < block.length && d > 0) {
      if (block[j] === "{") d++;
      else if (block[j] === "}") d--;
      j++;
    }
    const body = block.slice(s, j - 1);
    const keys: string[] = [];
    for (const k of body.matchAll(/(?:^|\n|,)\s*["']?([\w-]+)["']?\s*:/g)) keys.push(k[1]);
    if (keys.length) out[g[1]] = keys;
    groupRe.lastIndex = g.index + g[0].length + (j - s);
  }
  return out;
}

/** For a text rendered by a component, find the component element and its variant options. */
export function componentProps(root: string, edit: TextEdit): ComponentProps | { ok: false; message: string } {
  const hit = elementAround(root, edit);
  if (!hit) return { ok: false, message: "Component not found." };
  const { abs, el } = hit;
  const name = el.openingElement.name;
  if (name.type !== "JSXIdentifier" || !/^[A-Z]/.test(name.name)) return { ok: false, message: "Not a component." };
  const code = fs.readFileSync(abs, "utf8");
  const ast = parseSource(code, abs);
  let source: string | null = null;
  walk(ast, (node) => {
    if (node.type === "ImportDeclaration" && node.specifiers.some((s: any) => s.local?.name === name.name))
      source = node.source.value;
  });
  const definition = source ? resolveImport(root, abs, source) : null;
  const options = definition ? variantsOf(fs.readFileSync(definition, "utf8")) : {};
  const current: Record<string, string> = {};
  for (const key of Object.keys(options)) {
    const v = attrLiteral(el.openingElement, key);
    if (v != null) current[key] = v;
  }
  return {
    ok: true,
    file: path.relative(root, abs).split(path.sep).join("/"),
    line: el.openingElement.loc.start.line,
    column: el.openingElement.loc.start.column,
    component: name.name,
    definition: definition ? path.relative(root, definition).split(path.sep).join("/") : undefined,
    options,
    current,
  };
}

/** Set (or remove, with null) a literal prop on the JSX element at file:line:col. */
export function setProp(
  root: string,
  loc: { file: string; line: number; column: number },
  name: string,
  value: string | null,
): { ok: true; file: string; line: number } | { ok: false; message: string } {
  const abs = path.resolve(root, loc.file);
  if (!abs.startsWith(path.resolve(root)) || !fs.existsSync(abs)) return { ok: false, message: "File not found." };
  const code = fs.readFileSync(abs, "utf8");
  let el: any = null;
  walk(parseSource(code, abs), (node) => {
    if (
      !el &&
      node.type === "JSXOpeningElement" &&
      node.loc.start.line === loc.line &&
      node.loc.start.column === loc.column
    )
      el = node;
  });
  if (!el) return { ok: false, message: `Element not found at ${loc.file}:${loc.line}.` };
  fs.writeFileSync(abs, updateAttributes(code, el, [{ name, value }]));
  return { ok: true, file: loc.file, line: loc.line };
}
