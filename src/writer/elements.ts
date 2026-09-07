import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import { parseSource, walk } from "../transform/index.js";

export interface ElementOp {
  file?: string;
  line?: number;
  column?: number;
}

export type ElementResult = { ok: true; file: string; line: number } | { ok: false; message: string };

function elementAt(ast: any, line: number, column: number): any | null {
  let found: any = null;
  walk(ast, (node) => {
    if (found) return;
    if (
      node.type === "JSXElement" &&
      node.openingElement.loc.start.line === line &&
      node.openingElement.loc.start.column === column
    ) {
      found = node;
    }
  });
  return found;
}

/** The element's source plus the whitespace that precedes it on its own line, when it sits on its own line. */
function ownLine(
  code: string,
  start: number,
  end: number,
): { start: number; end: number; indent: string; ownLine: boolean } {
  let ls = start;
  while (ls > 0 && code[ls - 1] !== "\n") ls--;
  const before = code.slice(ls, start);
  let le = end;
  while (le < code.length && code[le] !== "\n") le++;
  const after = code.slice(end, le);
  const own = /^\s*$/.test(before) && /^\s*$/.test(after);
  return {
    start: own ? ls : start,
    end: own ? Math.min(le + 1, code.length) : end,
    indent: before.match(/^\s*/)![0],
    ownLine: own,
  };
}

function load(root: string, op: ElementOp): { abs: string; code: string; el: any } | { ok: false; message: string } {
  if (!op.file || op.line == null || op.column == null) {
    return { ok: false, message: "This element is rendered by a component. Change it in that component's file." };
  }
  const abs = path.resolve(root, op.file);
  if (!abs.startsWith(path.resolve(root)) || !fs.existsSync(abs)) return { ok: false, message: "File not found." };
  const code = fs.readFileSync(abs, "utf8");
  const el = elementAt(parseSource(code, abs), op.line, op.column);
  if (!el) return { ok: false, message: `Element not found at ${op.file}:${op.line}.` };
  return { abs, code, el };
}

/** Insert a copy of the element right after it, on its own line when it has one. */
export function duplicateElement(root: string, op: ElementOp): ElementResult {
  const r = load(root, op);
  if ("ok" in r) return r;
  const { abs, code, el } = r;
  const src = code.slice(el.start, el.end);
  const line = ownLine(code, el.start, el.end);
  const s = new MagicString(code);
  if (line.ownLine) s.appendLeft(line.end, line.indent + src + "\n");
  else s.appendLeft(el.end, src);
  fs.writeFileSync(abs, s.toString());
  return { ok: true, file: op.file!, line: op.line! };
}

/** Remove the element, and the line it sat on when it was alone there. */
export function deleteElement(root: string, op: ElementOp): ElementResult {
  const r = load(root, op);
  if ("ok" in r) return r;
  const { abs, code, el } = r;
  const line = ownLine(code, el.start, el.end);
  const s = new MagicString(code);
  s.remove(line.start, line.end);
  fs.writeFileSync(abs, s.toString());
  return { ok: true, file: op.file!, line: op.line! };
}
