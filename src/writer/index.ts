import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import { parseSource, walk, parseLocator } from "../transform/index.js";
import { renderJsxText, encodeJsxText, normalize } from "./jsx-text.js";

export interface TextEdit {
  /** Path relative to the project root, as carried by data-crayon. */
  file?: string;
  line?: number;
  column?: number;
  /** data-crayon values of the DOM ancestors, nearest first. Used to break ties. */
  ancestors?: string[];
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
  /** 1 = JSX text, 2 = JSX attribute, 3 = any other string literal. Lower is more trustworthy. */
  tier?: 1 | 2 | 3;
}

/** Attributes whose values are never user-facing copy. */
const NON_COPY_ATTRS =
  /^(className|class|id|key|href|src|srcSet|type|name|style|role|htmlFor|rel|target|method|action|for|lang|dir|sizes|media|as|variant|size|color|mode|align|side|orientation|value|defaultValue|data-.*|on[A-Z].*)$/;

function stringSlot(node: any, file: string, tier: 1 | 2 | 3): TextSlot | null {
  if (node.type === "StringLiteral") {
    if (node.value.trim() === "") return null;
    return {
      file,
      line: node.loc.start.line,
      start: node.start,
      end: node.end,
      kind: "string",
      rendered: node.value,
      raw: node.extra?.raw ?? "",
      quote: (node.extra?.raw ?? '"')[0],
      tier,
    };
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    const v = node.quasis[0].value.cooked ?? "";
    if (v.trim() === "") return null;
    return {
      file,
      line: node.loc.start.line,
      start: node.start,
      end: node.end,
      kind: "template",
      rendered: v,
      raw: node.quasis[0].value.raw,
      tier,
    };
  }
  return null;
}

/** Classify a string literal by where it sits in the code. Returns null when it cannot be user-facing copy. */
function literalTier(node: any, parent: any, ancestors: any[]): 2 | 3 | null {
  if (!parent) return 3;
  const t = parent.type as string;
  if (t.startsWith("TS")) return null;
  if (
    t === "ImportDeclaration" ||
    t === "ExportNamedDeclaration" ||
    t === "ExportAllDeclaration" ||
    t === "ImportExpression"
  )
    return null;
  if (t === "JSXExpressionContainer") return null; // handled as tier 1 through textSlots
  if (t === "JSXAttribute") {
    const name = parent.name?.name ?? parent.name?.name?.name ?? "";
    return NON_COPY_ATTRS.test(String(name)) ? null : 2;
  }
  if (
    (t === "ObjectProperty" || t === "ClassProperty" || t === "ObjectMethod") &&
    parent.key === node &&
    !parent.computed
  )
    return null;
  if (
    t === "CallExpression" &&
    parent.callee?.type === "Identifier" &&
    /^(require|cn|clsx|cva|classNames|twMerge|tv)$/.test(parent.callee.name)
  )
    return null;
  if (t === "Directive" || t === "DirectiveLiteral") return null;
  if (t === "MemberExpression" && parent.property === node) return null;
  if (t === "BinaryExpression" && /^(===|!==|==|!=)$/.test(parent.operator)) return null;
  if (t === "SwitchCase") return null;
  // A literal inside a JSX expression (ternary, &&, template…) is as good as an attribute.
  for (const a of ancestors) {
    if (a.type === "JSXExpressionContainer") return 2;
    if (/Function|Method|Program|ClassBody/.test(a.type)) break;
  }
  return 3;
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
      slots.push({
        file,
        line: child.loc.start.line + leadingNewlines,
        start: child.start,
        end: child.end,
        kind: "jsxtext",
        rendered,
        raw: child.value,
      });
    } else if (child.type === "JSXExpressionContainer") {
      const e = child.expression;
      if (e.type === "StringLiteral") {
        if (e.value.trim() === "") continue;
        slots.push({
          file,
          line: e.loc.start.line,
          start: e.start,
          end: e.end,
          kind: "string",
          rendered: e.value,
          raw: e.extra?.raw ?? "",
          quote: (e.extra?.raw ?? '"')[0],
        });
      } else if (e.type === "TemplateLiteral" && e.expressions.length === 0) {
        const v = e.quasis[0].value.cooked ?? "";
        if (v.trim() === "") continue;
        slots.push({
          file,
          line: e.loc.start.line,
          start: e.start,
          end: e.end,
          kind: "template",
          rendered: v,
          raw: e.quasis[0].value.raw,
        });
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

/** Every text slot in the project whose rendered value equals `text`, grouped by tier. */
function searchText(root: string, text: string): TextSlot[] {
  const target = normalize(text);
  const hits: TextSlot[] = [];
  const push = (slot: TextSlot | null) => {
    if (slot && normalize(slot.rendered) === target) hits.push(slot);
  };
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
    walk(
      ast,
      (node, parent, ancestors) => {
        if (node.type === "JSXElement") {
          const slots = textSlots(node, file);
          if (slots === "composite") return;
          for (const slot of slots) push({ ...slot, tier: 1 });
        } else if (node.type === "StringLiteral" || node.type === "TemplateLiteral") {
          const tier = literalTier(node, parent, ancestors);
          if (tier) push(stringSlot(node, file, tier));
        }
      },
      [],
    );
  }
  return hits;
}

/**
 * Best tier that has hits; then, when several remain, use the DOM ancestors to choose:
 * prefer the file of the nearest ancestor, then the closest line at or after that ancestor.
 */
function pickHits(root: string, hits: TextSlot[], ancestors: string[] = []): TextSlot[] {
  let pool: TextSlot[] = [];
  for (const tier of [1, 2, 3] as const) {
    pool = hits.filter((h) => h.tier === tier);
    if (pool.length) break;
  }
  if (pool.length <= 1 || ancestors.length === 0) return pool;
  const chain = ancestors.map(parseLocator).filter((l): l is NonNullable<typeof l> => !!l);
  for (const anc of chain) {
    const abs = path.resolve(root, anc.file);
    const sameFile = pool.filter((h) => h.file === abs);
    if (sameFile.length === 0) continue;
    if (sameFile.length === 1) return sameFile;
    const after = sameFile.filter((h) => h.line >= anc.line);
    const candidates = after.length ? after : sameFile;
    candidates.sort((a, b) => Math.abs(a.line - anc.line) - Math.abs(b.line - anc.line));
    return [candidates[0]];
  }
  return pool;
}

function write(root: string, slot: TextSlot, newText: string, how: EditResult["how"]): EditResult {
  const code = fs.readFileSync(slot.file, "utf8");
  const s = new MagicString(code);
  s.overwrite(slot.start, slot.end, replacement(slot, newText));
  fs.writeFileSync(slot.file, s.toString());
  return { ok: true, file: path.relative(root, slot.file).split(path.sep).join("/"), line: slot.line, how };
}

export type Located = { ok: true; slot: TextSlot; how: EditResult["how"] };

export function applyTextEdit(root: string, edit: TextEdit): EditResult | EditFailure {
  const located = locateTextEdit(root, edit);
  if (!located.ok) return located;
  return write(root, located.slot, edit.newText, located.how);
}

/** Find where an edit would land, without writing anything. */
export function locateTextEdit(root: string, edit: TextEdit): Located | EditFailure {
  const oldText = normalize(edit.oldText);
  if (!oldText) return { ok: false, reason: "unsupported", message: "Empty text cannot be located." };

  if (edit.file && edit.line != null && edit.column != null) {
    const abs = path.resolve(root, edit.file);
    if (!abs.startsWith(path.resolve(root)))
      return { ok: false, reason: "unsupported", message: "File outside project." };
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
          if (exact) return { ok: true, slot: exact, how: "located" };
          if (slots.length === 1 && normalize(slots.map((s) => s.rendered).join("")) === oldText) {
            return { ok: true, slot: slots[0], how: "located" };
          }
        }
      }
    }
  }

  const hits = pickHits(root, searchText(root, oldText), edit.ancestors);
  if (hits.length === 1) return { ok: true, slot: hits[0], how: "matched" };
  if (hits.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      message: `This text appears ${hits.length} times in the code.`,
      candidates: hits.map((h) => `${path.relative(root, h.file)}:${h.line}`),
    };
  }
  const where = edit.file && edit.line ? ` (rendered by ${edit.file.split("/").pop()}:${edit.line})` : "";
  return {
    ok: false,
    reason: "dynamic",
    message: `This text is not written as-is in the code${where}. It is probably computed, or comes from data or a CMS.`,
  };
}
