import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import { parseSource, walk, parseLocator } from "../transform/index.js";
import { encodeJsxText, renderJsxText, normalize } from "./jsx-text.js";

/** One piece of an element's content as edited in the page. */
export type Part = { text: string } | { tag: string; locator?: string; text: string; void?: boolean };

export interface CompositeEdit {
  file?: string;
  line?: number;
  column?: number;
  /** data-crayon of any child element, used when the element itself is rendered by a component. */
  childLocator?: string;
  parts: Part[];
}

export type CompositeResult = { ok: true; file: string; line: number } | { ok: false; message: string };

function findElement(ast: any, line: number, column: number): { el: any; parent: any } | null {
  let found: { el: any; parent: any } | null = null;
  walk(ast, (node, _p, ancestors) => {
    if (found) return;
    if (
      node.type === "JSXElement" &&
      node.openingElement.loc.start.line === line &&
      node.openingElement.loc.start.column === column
    ) {
      found = { el: node, parent: ancestors.find((a) => a.type === "JSXElement" || a.type === "JSXFragment") ?? null };
    }
  });
  return found;
}

const INLINE = new Set([
  "b",
  "strong",
  "em",
  "i",
  "u",
  "s",
  "br",
  "span",
  "a",
  "code",
  "mark",
  "small",
  "sup",
  "sub",
  "kbd",
  "abbr",
  "time",
]);

/** Tags the page may create on its own when the user formats a selection. */
const NEW_INLINE = new Set(["strong", "em", "b", "i", "u", "s", "mark", "code"]);

/** Rebuild the children of a JSX element from edited parts. Child elements keep their original source. */
export function applyCompositeEdit(root: string, edit: CompositeEdit): CompositeResult {
  let file = edit.file;
  let line = edit.line;
  let column = edit.column;
  let viaChild = false;
  if ((!file || line == null || column == null) && edit.childLocator) {
    const l = parseLocator(edit.childLocator);
    if (!l) return { ok: false, message: "Cannot locate this text." };
    ({ file, line, column } = l);
    viaChild = true;
  }
  if (!file || line == null || column == null) {
    return { ok: false, message: "This text is rendered by a component. Edit it in that component's file." };
  }
  const abs = path.resolve(root, file);
  if (!abs.startsWith(path.resolve(root)) || !fs.existsSync(abs)) return { ok: false, message: "File not found." };
  const code = fs.readFileSync(abs, "utf8");
  const ast = parseSource(code, abs);
  const hit = findElement(ast, line, column);
  if (!hit) return { ok: false, message: `Element not found at ${file}:${line}.` };
  const el = viaChild ? hit.parent : hit.el;
  if (!el || el.type !== "JSXElement" || !el.closingElement) {
    return { ok: false, message: "Cannot rebuild this element's content." };
  }

  // Only static children can be rebuilt: text, string literals, and inline host elements.
  for (const c of el.children) {
    if (c.type === "JSXText") continue;
    if (
      c.type === "JSXExpressionContainer" &&
      (c.expression.type === "StringLiteral" || c.expression.type === "JSXEmptyExpression")
    ) {
      continue;
    }
    if (
      c.type === "JSXElement" &&
      c.openingElement.name.type === "JSXIdentifier" &&
      INLINE.has(c.openingElement.name.name)
    ) {
      continue;
    }
    // Icon components (<Download className="size-4" />): opaque, kept in order.
    if (
      c.type === "JSXElement" &&
      c.openingElement.name.type === "JSXIdentifier" &&
      /^[A-Z]/.test(c.openingElement.name.name) &&
      c.children.length === 0
    ) {
      continue;
    }
    return {
      ok: false,
      message: "This text mixes dynamic values or components. Click a single piece of text instead.",
    };
  }
  const childByPos = new Map<string, any>();
  const opaque: any[] = [];
  for (const c of el.children) {
    if (c.type === "JSXElement") {
      childByPos.set(`${c.openingElement.loc.start.line}:${c.openingElement.loc.start.column}`, c);
      if (/^[A-Z]/.test(c.openingElement.name.name ?? "")) opaque.push(c);
    }
  }
  const regionStart = el.openingElement.end;
  const regionEnd = el.closingElement.start;
  const region = code.slice(regionStart, regionEnd);
  const lead = /^\s*/.exec(region)![0];
  const trail = /\s*$/.exec(region)![0];

  const out: string[] = [];
  for (const part of edit.parts) {
    if (!("tag" in part)) {
      out.push(encodeJsxText(part.text.replace(/\r?\n/g, " ")));
      continue;
    }
    if (part.tag === "svg" && !part.locator) {
      const icon = opaque.shift();
      if (icon) out.push(code.slice(icon.start, icon.end));
      continue;
    }
    const loc = part.locator ? parseLocator(part.locator) : null;
    const original = loc ? childByPos.get(`${loc.line}:${loc.column}`) : null;
    if (!original) {
      if (part.tag === "br") {
        out.push("<br />");
        continue;
      }
      // Formatting added in the page (⌘B, ⌘I): a plain new element.
      if (NEW_INLINE.has(part.tag)) {
        out.push(`<${part.tag}>${encodeJsxText(part.text.replace(/\r?\n/g, " "))}</${part.tag}>`);
        continue;
      }
      return { ok: false, message: `Cannot map <${part.tag}> back to the code. Click the text inside it instead.` };
    }
    let src = code.slice(original.start, original.end);
    if (!part.void && original.closingElement) {
      const kids = original.children;
      const texts = kids.filter((k: any) => k.type === "JSXText");
      const same = normalize(texts.map((t: any) => renderJsxText(t.value)).join("")) === normalize(part.text);
      if (!same) {
        if (kids.length !== 1 || kids[0].type !== "JSXText") {
          return { ok: false, message: `The text inside <${part.tag}> is not plain. Click it directly.` };
        }
        const inner = code.slice(original.openingElement.end, original.closingElement.start);
        const l2 = /^\s*/.exec(inner)![0];
        const t2 = /\s*$/.exec(inner)![0];
        src =
          code.slice(original.start, original.openingElement.end) +
          l2 +
          encodeJsxText(part.text.replace(/\r?\n/g, " ")) +
          t2 +
          code.slice(original.closingElement.start, original.end);
      }
    }
    out.push(src);
  }
  const s = new MagicString(code);
  s.overwrite(regionStart, regionEnd, lead + out.join("") + trail);
  fs.writeFileSync(abs, s.toString());
  return { ok: true, file: path.relative(root, abs).split(path.sep).join("/"), line: el.openingElement.loc.start.line };
}
