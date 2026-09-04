import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import { parseSource, walk } from "../transform/index.js";

export interface ClassEdit {
  file?: string;
  line?: number;
  column?: number;
  remove: string[];
  add: string[];
}

export interface ClassResult {
  ok: true;
  file: string;
  line: number;
  /** Tokens that could not be removed because they are not literals in this element (variants, CSS modules). */
  missing: string[];
}
export interface ClassFailure {
  ok: false;
  message: string;
}

interface Literal {
  start: number;
  end: number;
  value: string;
  kind: "string" | "template" | "jsxtext";
  raw: string;
}

/** Every string literal inside a className attribute value: plain string, template quasis, cn()/clsx() arguments. */
function classLiterals(attr: any): Literal[] {
  const out: Literal[] = [];
  const visit = (node: any) => {
    if (!node) return;
    if (node.type === "StringLiteral") {
      out.push({
        start: node.start,
        end: node.end,
        value: node.value,
        kind: "string",
        raw: node.extra?.raw ?? `"${node.value}"`,
      });
    } else if (node.type === "TemplateLiteral") {
      for (const q of node.quasis)
        out.push({ start: q.start, end: q.end, value: q.value.cooked ?? "", kind: "template", raw: q.value.raw });
      node.expressions.forEach(visit);
    } else if (node.type === "JSXExpressionContainer") {
      visit(node.expression);
    } else if (node.type === "CallExpression") {
      node.arguments.forEach(visit);
    } else if (node.type === "ConditionalExpression") {
      visit(node.consequent);
      visit(node.alternate);
    } else if (node.type === "LogicalExpression") {
      visit(node.right);
    } else if (node.type === "ArrayExpression") {
      node.elements.forEach(visit);
    }
  };
  visit(attr.value);
  return out;
}

function describe(attr: any): string {
  const v = attr?.value;
  if (!v) return "no className";
  if (v.type === "JSXExpressionContainer") {
    const e = v.expression;
    if (e.type === "MemberExpression") return `a CSS module (${e.object?.name ?? "styles"}.${e.property?.name ?? "…"})`;
    if (e.type === "Identifier") return `a variable (${e.name})`;
    if (e.type === "CallExpression") return `a ${e.callee?.name ?? "function"}() call`;
  }
  return "an expression";
}

export function applyClassEdit(root: string, edit: ClassEdit): ClassResult | ClassFailure {
  if (!edit.file || edit.line == null || edit.column == null)
    return {
      ok: false,
      message: "This element is rendered by a component. Change its classes in that component's file.",
    };
  const abs = path.resolve(root, edit.file);
  if (!abs.startsWith(path.resolve(root)) || !fs.existsSync(abs)) return { ok: false, message: "File not found." };
  const code = fs.readFileSync(abs, "utf8");
  let element: any = null;
  walk(parseSource(code, abs), (node) => {
    if (
      !element &&
      node.type === "JSXOpeningElement" &&
      node.loc.start.line === edit.line &&
      node.loc.start.column === edit.column
    )
      element = node;
  });
  if (!element)
    return { ok: false, message: `Element not found at ${edit.file}:${edit.line}. Save your editor and try again.` };
  const attr = element.attributes.find(
    (a: any) => a.type === "JSXAttribute" && (a.name?.name === "className" || a.name?.name === "class"),
  );
  const literals = attr ? classLiterals(attr) : [];
  if (attr && literals.length === 0) {
    return {
      ok: false,
      message: `This element's styles come from ${describe(attr)}, not from Tailwind classes. Change them in your CSS.`,
    };
  }

  const s = new MagicString(code);
  const missing: string[] = [];
  const removeSet = new Set(edit.remove);
  const updated = literals.map((lit) => ({ lit, tokens: lit.value.split(/\s+/).filter(Boolean) }));
  for (const token of removeSet) {
    if (!updated.some((u) => u.tokens.includes(token))) missing.push(token);
  }
  for (const u of updated) u.tokens = u.tokens.filter((t) => !removeSet.has(t));
  const toAdd = edit.add.filter((t) => !updated.some((u) => u.tokens.includes(t)));
  if (updated.length) {
    // add to the first literal that had a token we removed, else the first literal
    const target = updated.find((u) => u.lit.value.split(/\s+/).some((t) => removeSet.has(t))) ?? updated[0];
    target.tokens.push(...toAdd);
    for (const u of updated) {
      const value = u.tokens.join(" ");
      const lead = /^\s*/.exec(u.lit.value)![0];
      const trail = /\s*$/.exec(u.lit.value)![0];
      const body =
        u.lit.kind === "template"
          ? lead + value + trail
          : u.lit.kind === "string"
            ? u.lit.raw[0] + lead + value + trail + u.lit.raw[0]
            : value;
      if (u.lit.kind === "template" && u.lit.value === u.lit.raw) s.overwrite(u.lit.start, u.lit.end, body);
      else if (u.lit.kind === "template") s.overwrite(u.lit.start, u.lit.end, body);
      else s.overwrite(u.lit.start, u.lit.end, body);
    }
  } else if (toAdd.length) {
    const insertAt = element.attributes.length
      ? element.attributes[element.attributes.length - 1].end
      : element.name.end;
    s.appendLeft(insertAt, ` className="${toAdd.join(" ")}"`);
  }
  fs.writeFileSync(abs, s.toString());
  return { ok: true, file: edit.file, line: edit.line, missing };
}
