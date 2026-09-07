import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import { listFiles } from "./files.js";

export interface Declaration {
  prop: string;
  value: string;
  start: number;
  end: number;
  /** offset of the value inside the file */
  valueStart: number;
  valueEnd: number;
}
export interface Rule {
  selector: string;
  /** offset just after "{" */
  bodyStart: number;
  /** offset of the closing "}" */
  bodyEnd: number;
  declarations: Declaration[];
  line: number;
  /** Inside @media / @supports / @container: never the place to add a base style. */
  nested: boolean;
}

/** A small CSS reader: top-level and nested (@media, @supports, @layer) style rules with their declarations. */
export function parseCss(css: string): Rule[] {
  const rules: Rule[] = [];
  const lineOf = (i: number) => css.slice(0, i).split("\n").length;
  const read = (from: number, to: number, nested = false) => {
    let i = from;
    while (i < to) {
      const ch = css[i];
      if (ch === "/" && css[i + 1] === "*") {
        const e = css.indexOf("*/", i + 2);
        i = e < 0 ? to : e + 2;
        continue;
      }
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      // prelude up to "{" or ";"
      let j = i;
      let quote = "";
      while (j < to) {
        const c = css[j];
        if (quote) {
          if (c === quote && css[j - 1] !== "\\") quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === "{" || c === ";") break;
        j++;
      }
      if (j >= to) break;
      const prelude = css.slice(i, j).trim();
      if (css[j] === ";") {
        i = j + 1;
        continue;
      }
      // find matching "}"
      let depth = 1;
      let k = j + 1;
      quote = "";
      while (k < to && depth > 0) {
        const c = css[k];
        if (quote) {
          if (c === quote && css[k - 1] !== "\\") quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === "/" && css[k + 1] === "*") {
          const e = css.indexOf("*/", k + 2);
          k = e < 0 ? to : e + 1;
        } else if (c === "{") depth++;
        else if (c === "}") depth--;
        k++;
      }
      const bodyStart = j + 1;
      const bodyEnd = k - 1;
      if (prelude.startsWith("@")) {
        if (/^@(media|supports|layer|container)\b/.test(prelude))
          read(bodyStart, bodyEnd, !/^@layer\b/.test(prelude) || nested);
      } else {
        rules.push({
          selector: prelude,
          bodyStart,
          bodyEnd,
          declarations: parseDeclarations(css, bodyStart, bodyEnd),
          line: lineOf(i),
          nested,
        });
      }
      i = k;
    }
  };
  read(0, css.length);
  return rules;
}

function parseDeclarations(css: string, from: number, to: number): Declaration[] {
  const out: Declaration[] = [];
  let i = from;
  while (i < to) {
    while (i < to && /\s/.test(css[i])) i++;
    if (css[i] === "/" && css[i + 1] === "*") {
      const e = css.indexOf("*/", i + 2);
      i = e < 0 ? to : e + 2;
      continue;
    }
    const start = i;
    let depth = 0;
    let quote = "";
    let j = i;
    while (j < to) {
      const c = css[j];
      if (quote) {
        if (c === quote && css[j - 1] !== "\\") quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === ";" && depth === 0) break;
      else if (c === "{") {
        // nested rule inside a declaration list: skip its block
        let d = 1;
        j++;
        while (j < to && d > 0) {
          if (css[j] === "{") d++;
          else if (css[j] === "}") d--;
          j++;
        }
        i = j;
        break;
      }
      j++;
    }
    if (j <= start) break;
    const text = css.slice(start, j);
    const colon = text.indexOf(":");
    if (colon > 0 && !text.includes("{")) {
      const prop = text.slice(0, colon).trim();
      const rawValue = text.slice(colon + 1);
      const lead = rawValue.length - rawValue.trimStart().length;
      const value = rawValue.trim();
      out.push({
        prop,
        value,
        start,
        end: j,
        valueStart: start + colon + 1 + lead,
        valueEnd: start + colon + 1 + lead + value.length,
      });
    }
    i = j + 1;
  }
  return out;
}

export interface ElementDesc {
  tag: string;
  id?: string;
  classes: string[];
}

/** Does the last compound of this selector match the element? Pseudo-classes and pseudo-elements are excluded (base state only). */
export function selectorMatches(selector: string, el: ElementDesc): number | null {
  let best: number | null = null;
  for (const raw of selector.split(",")) {
    const sel = raw.trim();
    if (
      !sel ||
      /::|:(hover|focus|active|visited|disabled|checked|before|after|first|last|nth|not|where|is|has|empty|target|placeholder)/.test(
        sel,
      )
    )
      continue;
    const compound =
      sel
        .split(/\s*[>+~]\s*|\s+/)
        .filter(Boolean)
        .pop() ?? "";
    const parts = compound.match(/^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/);
    if (!parts) continue;
    const tag = parts[1];
    if (tag && tag !== "*" && tag.toLowerCase() !== el.tag.toLowerCase()) continue;
    const tokens = (parts[2].match(/[.#][\w-]+/g) ?? []) as string[];
    let ok = true;
    let ids = 0;
    let classes = 0;
    for (const t of tokens) {
      if (t[0] === "#") {
        ids++;
        if (el.id !== t.slice(1)) ok = false;
      } else {
        classes++;
        if (!el.classes.includes(t.slice(1))) ok = false;
      }
    }
    if (!ok) continue;
    // whole-selector specificity, so ".card .btn" beats ".btn"
    const allIds = (sel.match(/#[\w-]+/g) ?? []).length;
    const allClasses = (sel.match(/\.[\w-]+/g) ?? []).length;
    const allTags = (sel.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
    const spec = allIds * 10000 + allClasses * 100 + allTags + (tag ? 0 : 0) + (ids + classes === 0 && !tag ? -1 : 0);
    if (best === null || spec > best) best = spec;
  }
  return best;
}

const SHORTHANDS: Record<string, string[]> = {
  "background-color": ["background-color", "background"],
  color: ["color"],
  "font-size": ["font-size"],
  "font-weight": ["font-weight"],
  "font-style": ["font-style"],
  "border-radius": ["border-radius"],
  padding: ["padding"],
  "font-family": ["font-family"],
};

export interface CssEdit {
  el: ElementDesc;
  prop: string;
  value: string;
}

export type CssResult =
  { ok: true; file: string; line: number; selector: string; how: "updated" | "added" } | { ok: false; message: string };

export function listCssFiles(root: string): string[] {
  return listFiles(root, (n) => n.endsWith(".css") && !n.endsWith(".module.css"), 6);
}

/** Change one property on the CSS rule that styles this element: the most specific matching rule that already sets it, else the most specific matching class rule. */
export function setCssProperty(root: string, edit: CssEdit): CssResult {
  const props = SHORTHANDS[edit.prop] ?? [edit.prop];
  type Cand = { file: string; rule: Rule; spec: number; decl: Declaration | null; order: number };
  const cands: Cand[] = [];
  let order = 0;
  for (const file of listCssFiles(root)) {
    let css: string;
    try {
      css = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const rule of parseCss(css)) {
      const spec = selectorMatches(rule.selector, edit.el);
      if (spec === null) continue;
      const decl = [...rule.declarations].reverse().find((d) => props.includes(d.prop.toLowerCase())) ?? null;
      cands.push({ file, rule, spec, decl, order: order++ });
    }
  }
  if (!cands.length)
    return {
      ok: false,
      message: `No CSS rule matches this <${edit.el.tag}>${edit.el.classes.map((c) => "." + c).join("")}.`,
    };
  const rank = (a: Cand, b: Cand) =>
    Number(a.rule.nested) - Number(b.rule.nested) || b.spec - a.spec || b.order - a.order;
  const withDecl = cands.filter((c) => c.decl).sort(rank);
  const target = withDecl[0] ?? cands.filter((c) => /[.#]/.test(c.rule.selector)).sort(rank)[0] ?? cands.sort(rank)[0];
  const css = fs.readFileSync(target.file, "utf8");
  const s = new MagicString(css);
  let how: "updated" | "added";
  if (target.decl) {
    // keep "!important" if it was there
    const important = /!important\s*$/i.test(target.decl.value) ? " !important" : "";
    s.overwrite(target.decl.valueStart, target.decl.valueEnd, edit.value + important);
    how = "updated";
  } else {
    const body = css.slice(target.rule.bodyStart, target.rule.bodyEnd);
    const multiline = body.includes("\n");
    const indent = multiline ? (body.match(/\n([ \t]+)\S/)?.[1] ?? "  ") : " ";
    const last = target.rule.declarations[target.rule.declarations.length - 1];
    const needsSemi = last ? css.slice(last.end, last.end + 1) !== ";" : false;
    const insertAt = last ? last.end + (needsSemi ? 0 : 1) : target.rule.bodyStart;
    s.appendLeft(insertAt, `${needsSemi ? ";" : ""}${multiline ? "\n" + indent : " "}${edit.prop}: ${edit.value};`);
    how = "added";
  }
  fs.writeFileSync(target.file, s.toString());
  return {
    ok: true,
    file: path.relative(root, target.file).split(path.sep).join("/"),
    line: target.rule.line,
    selector: target.rule.selector,
    how,
  };
}

/** Custom properties declared on :root in the project's CSS, for the colour swatches. */
export function readCssVars(root: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const file of listCssFiles(root)) {
    let css: string;
    try {
      css = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const rule of parseCss(css)) {
      if (!/^(:root|html|body)$/.test(rule.selector.trim())) continue;
      for (const d of rule.declarations) if (d.prop.startsWith("--")) vars[d.prop.slice(2)] = d.value;
    }
  }
  return vars;
}
