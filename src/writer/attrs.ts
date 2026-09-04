import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import { parseSource, walk, parseLocator } from "../transform/index.js";
import { listSourceFiles } from "./files.js";

export interface ElementTarget {
  /** Absolute file path. */
  file: string;
  /** The JSXOpeningElement node. */
  element: any;
  line: number;
}

export interface AttrLocator {
  file?: string;
  line?: number;
  column?: number;
  ancestors?: string[];
  /** Attribute name to match, e.g. "src". */
  attr: string;
  /** Its current literal value, as rendered. */
  value: string;
}

function attrOf(element: any, name: string): any | null {
  return element.attributes?.find((a: any) => a.type === "JSXAttribute" && a.name?.name === name) ?? null;
}

/** The literal string value of an attribute, if it is a plain literal. */
export function attrLiteral(element: any, name: string): string | null {
  const a = attrOf(element, name);
  if (!a) return null;
  const v = a.value;
  if (!v) return "";
  if (v.type === "StringLiteral") return v.value;
  if (v.type === "JSXExpressionContainer") {
    const e = v.expression;
    if (e.type === "StringLiteral") return e.value;
    if (e.type === "NumericLiteral") return String(e.value);
    if (e.type === "TemplateLiteral" && e.expressions.length === 0) return e.quasis[0].value.cooked ?? null;
  }
  return null;
}

function elementAt(ast: any, line: number, column: number): any | null {
  let found: any = null;
  walk(ast, (node) => {
    if (found) return;
    if (node.type === "JSXOpeningElement" && node.loc.start.line === line && node.loc.start.column === column)
      found = node;
  });
  return found;
}

/**
 * Find the JSX element that owns `attr="value"`. Tries the tagged position first (host elements),
 * then searches the project for an element with that exact attribute literal, using DOM ancestors to break ties.
 */
export function locateElement(
  root: string,
  loc: AttrLocator,
):
  ElementTarget | { ok: false; reason: "not-found" | "ambiguous" | "dynamic"; message: string; candidates?: string[] } {
  if (loc.file && loc.line != null && loc.column != null) {
    const abs = path.resolve(root, loc.file);
    if (abs.startsWith(path.resolve(root)) && fs.existsSync(abs)) {
      try {
        const ast = parseSource(fs.readFileSync(abs, "utf8"), abs);
        const el = elementAt(ast, loc.line, loc.column);
        if (el && attrLiteral(el, loc.attr) === loc.value) return { file: abs, element: el, line: el.loc.start.line };
        if (el && attrOf(el, loc.attr) && attrLiteral(el, loc.attr) === null) {
          return {
            ok: false,
            reason: "dynamic",
            message: `The ${loc.attr} of this element is an expression, not a literal (${loc.file.split("/").pop()}:${loc.line}).`,
          };
        }
      } catch {}
    }
  }
  const hits: ElementTarget[] = [];
  for (const file of listSourceFiles(root)) {
    let code: string;
    try {
      code = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!code.includes(loc.value)) continue;
    let ast: any;
    try {
      ast = parseSource(code, file);
    } catch {
      continue;
    }
    walk(ast, (node) => {
      if (node.type === "JSXOpeningElement" && attrLiteral(node, loc.attr) === loc.value)
        hits.push({ file, element: node, line: node.loc.start.line });
    });
  }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    const chain = (loc.ancestors ?? []).map(parseLocator).filter((l): l is NonNullable<typeof l> => !!l);
    for (const anc of chain) {
      const abs = path.resolve(root, anc.file);
      const same = hits.filter((h) => h.file === abs);
      if (!same.length) continue;
      same.sort((a, b) => Math.abs(a.line - anc.line) - Math.abs(b.line - anc.line));
      return same[0];
    }
    return {
      ok: false,
      reason: "ambiguous",
      message: `${loc.attr}="${loc.value}" appears ${hits.length} times.`,
      candidates: hits.map((h) => `${path.relative(root, h.file)}:${h.line}`),
    };
  }
  return { ok: false, reason: "not-found", message: `No element with ${loc.attr}="${loc.value}" found in the code.` };
}

export type AttrChange = { name: string; value: string | number | null };

/** Rewrite attributes on one element. Strings become "…", numbers {n}, null removes the attribute. Returns the new file content. */
export function updateAttributes(code: string, element: any, changes: AttrChange[]): string {
  const s = new MagicString(code);
  const attrs: any[] = element.attributes ?? [];
  const lastEnd = attrs.length ? attrs[attrs.length - 1].end : (element.typeArguments?.end ?? element.name.end);
  const inserts: string[] = [];
  for (const change of changes) {
    const existing = attrs.find((a) => a.type === "JSXAttribute" && a.name?.name === change.name);
    const rendered =
      change.value === null
        ? null
        : typeof change.value === "number"
          ? `{${change.value}}`
          : `"${String(change.value).replace(/"/g, "&quot;")}"`;
    if (existing) {
      if (rendered === null) {
        // remove attribute and the whitespace before it
        let start = existing.start;
        while (start > 0 && /\s/.test(code[start - 1])) start--;
        s.remove(start, existing.end);
      } else if (existing.value) {
        s.overwrite(existing.value.start, existing.value.end, rendered);
      } else {
        s.appendLeft(existing.end, `=${rendered}`);
      }
    } else if (rendered !== null) {
      inserts.push(`${change.name}=${rendered}`);
    }
  }
  if (inserts.length) {
    // Match the file's layout: one attribute per line if the element is already multi-line.
    const multiline = attrs.length > 0 && code.slice(element.start, attrs[0].start).includes("\n");
    const indent = multiline ? code.slice(code.lastIndexOf("\n", attrs[0].start) + 1, attrs[0].start) : " ";
    const sep = multiline ? "\n" + indent : " ";
    s.appendLeft(lastEnd, sep + inserts.join(sep));
  }
  return s.toString();
}
