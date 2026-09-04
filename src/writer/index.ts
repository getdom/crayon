import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import { parseSource, walk } from "../transform/index.js";
import { renderJsxText, encodeJsxText, normalize } from "./jsx-text.js";

export interface TextEdit {
  /** Path relative to the project root, as carried by data-crayon. */
  file?: string;
  line?: number;
  column?: number;
  oldText: string;
  newText: string;
}

export interface EditResult {
  ok: true;
  file: string;
  line: number;
  /** "located" = found at the data-crayon position, "matched" = found by unique text search. */
  how: "located" | "matched";
}

export interface EditFailure {
  ok: false;
  reason: "not-found" | "dynamic" | "ambiguous" | "composite" | "unsupported";
  message: string;
  candidates?: string[];
}

interface TextSlot {
  file: string;
  line: number;
  start: number;
  end: number;
  kind: "jsxtext" | "string" | "template";
  rendered: string;
  raw: string;
  quote?: string;
}

const SOURCE_EXT = new Set([".tsx", ".jsx", ".ts", ".js", ".mjs", ".mdx"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "out", ".turbo", ".vercel", "coverage"]);

/** The editable text slots directly inside a JSX element (no nested elements). */
function textSlots(element: any, file: string): TextSlot[] | "composite" {
  const slots: TextSlot[] = [];
  for (const child of element.children ?? []) {
    if (child.type === "JSXText") {
      const rendered = renderJsxText(child.value);
      if (rendered === "" || /^\s+$/.test(rendered)) continue;
      const leadingNewlines = (/^\s*/.exec(child.value)![0].match(/\n/g) ?? []).length;
      slots.push({ file, line: child.loc.start.line + leadingNewlines, start: child.start, end: child.end, kind: "jsxtext", rendered, raw: child.value });
    } else if (child.type === "JSXExpressionContainer") {
      const e = child.expression;
      if (e.type === "StringLiteral") {
        if (e.value.trim() === "") continue;
        slots.push({ file, line: e.loc.start.line, start: e.start, end: e.end, kind: "string", rendered: e.value, raw: e.extra?.raw ?? "", quote: (e.extra?.raw ?? '"')[0] });
      } else if (e.type === "TemplateLiteral" && e.expressions.length === 0) {
        const v = e.quasis[0].value.cooked ?? "";
        if (v.trim() === "") continue;
        slots.push({ file, line: e.loc.start.line, start: e.start, end: e.end, kind: "template", rendered: v, raw: e.quasis[0].value.raw });
      } else if (e.type === "JSXEmptyExpression") {
        continue;
      } else {
        return "composite";
      }
    } else if (child.type === "JSXElement" || child.type === "JSXFragment") {
      return "composite";
    }
  }
  return slots;
}

function replacement(slot: TextSlot, newText: string): string {
  const text = newText.replace(/\r?\n/g, " ");
  if (slot.kind === "jsxtext") {
    const lead = /^\s*/.exec(slot.raw)![0];
    const trail = /\s*$/.exec(slot.raw)![0];
    return lead + encodeJsxText(text) + trail;
  }
  if (slot.kind === "string") {
    const q = slot.quote === "'" ? "'" : '"';
    const body = text.replace(/\\/g, "\\\\").replace(new RegExp(q, "g"), "\\" + q);
    return q + body + q;
  }
  return "`" + text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
}

function findElementAt(ast: any, line: number, column: number): any | null {
  let found: any = null;
  walk(ast, (node) => {
    if (found) return;
    if (node.type === "JSXElement" && node.openingElement.loc.start.line === line && node.openingElement.loc.start.column === column) {
      found = node;
    }
  });
  return found;
}

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(full, depth + 1);
      } else if (SOURCE_EXT.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) {
        out.push(full);
      }
    }
  };
  visit(root, 0);
  return out;
}

/** Every text slot in the project whose rendered value equals `text`. */
function searchText(root: string, text: string): TextSlot[] {
  const target = normalize(text);
  const hits: TextSlot[] = [];
  for (const file of listSourceFiles(root)) {
    let code: string;
    try {
      code = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!code.includes(target.slice(0, Math.min(24, target.length)))) continue;
    let ast;
    try {
      ast = parseSource(code, file);
    } catch {
      continue;
    }
    walk(ast, (node) => {
      if (node.type !== "JSXElement") return;
      const slots = textSlots(node, file);
      if (slots === "composite") return;
      for (const slot of slots) {
        if (normalize(slot.rendered) === target) hits.push(slot);
      }
    });
  }
  return hits;
}

function write(root: string, slot: TextSlot, newText: string, how: EditResult["how"]): EditResult {
  const code = fs.readFileSync(slot.file, "utf8");
  const s = new MagicString(code);
  s.overwrite(slot.start, slot.end, replacement(slot, newText));
  fs.writeFileSync(slot.file, s.toString());
  return { ok: true, file: path.relative(root, slot.file).split(path.sep).join("/"), line: slot.line, how };
}

export function applyTextEdit(root: string, edit: TextEdit): EditResult | EditFailure {
  const oldText = normalize(edit.oldText);
  if (!oldText) return { ok: false, reason: "unsupported", message: "Empty text cannot be located." };

  if (edit.file && edit.line != null && edit.column != null) {
    const abs = path.resolve(root, edit.file);
    if (!abs.startsWith(path.resolve(root))) return { ok: false, reason: "unsupported", message: "File outside project." };
    if (fs.existsSync(abs)) {
      const code = fs.readFileSync(abs, "utf8");
      let ast: any = null;
      try {
        ast = parseSource(code, abs);
      } catch {}
      const element = ast && findElementAt(ast, edit.line, edit.column);
      if (element) {
        const slots = textSlots(element, abs);
        if (slots !== "composite") {
          const exact = slots.find((s) => normalize(s.rendered) === oldText);
          if (exact) return write(root, exact, edit.newText, "located");
          if (slots.length === 1 && normalize(slots.map((s) => s.rendered).join("")) === oldText) {
            return write(root, slots[0], edit.newText, "located");
          }
        }
      }
    }
  }

  const hits = searchText(root, oldText);
  if (hits.length === 1) return write(root, hits[0], edit.newText, "matched");
  if (hits.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      message: `This text appears ${hits.length} times in the code.`,
      candidates: hits.map((h) => `${path.relative(root, h.file)}:${h.line}`),
    };
  }
  return {
    ok: false,
    reason: "dynamic",
    message: "This text is not written as-is in the code. It probably comes from data, props or a CMS.",
  };
}
