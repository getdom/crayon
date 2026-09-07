import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { normalize } from "../writer/jsx-text.js";
import { findSubstring } from "../writer/substring.js";
import { listFiles } from "../writer/files.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

export const ATTR = "data-crayon";
const SKIP_TAGS = new Set(["html", "head", "body", "script", "style", "meta", "link", "title", "template", "noscript"]);

function isElement(n: Node): n is Element {
  return "tagName" in n && !!(n as Element).sourceCodeLocation;
}

function* elements(node: Node): Generator<Element> {
  const kids = ("childNodes" in node ? node.childNodes : []) as Node[];
  for (const k of kids) {
    if (isElement(k)) yield k;
    if ("childNodes" in k) yield* elements(k);
  }
}

function parseHtml(html: string) {
  return parse(html, { sourceCodeLocationInfo: true });
}

/** Add data-crayon="file:line:col" to every element of an HTML document. Column is 0-based like the JSX transform. */
export function tagHtml(html: string, relFile: string): string {
  const s = new MagicString(html);
  for (const el of elements(parseHtml(html))) {
    if (SKIP_TAGS.has(el.tagName)) continue;
    const st = el.sourceCodeLocation?.startTag;
    if (!st) continue;
    if (el.attrs.some((a) => a.name === ATTR)) continue;
    s.appendLeft(st.startOffset + 1 + el.tagName.length, ` ${ATTR}="${relFile}:${st.startLine}:${st.startCol - 1}"`);
  }
  return s.toString();
}

function elementAt(html: string, line: number, column: number): Element | null {
  for (const el of elements(parseHtml(html))) {
    const st = el.sourceCodeLocation?.startTag;
    if (st && st.startLine === line && st.startCol - 1 === column) return el;
  }
  return null;
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, b: string) => {
    if (b[0] === "#")
      return String.fromCodePoint(b[1].toLowerCase() === "x" ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10));
    return (
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[b.toLowerCase()] ?? m
    );
  });
}
const encode = (t: string) =>
  t
    .replace(/&/g, "&amp;")
    .replace(/\u00a0/g, "&nbsp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** The raw source range of an element's text content when it contains no child elements. */
function textRange(el: Element): { start: number; end: number; text: string } | "composite" | null {
  const kids = el.childNodes.filter((k) => k.nodeName !== "#comment");
  if (kids.some((k) => "tagName" in k)) return "composite";
  const texts = kids.filter((k) => k.nodeName === "#text") as DefaultTreeAdapterMap["textNode"][];
  if (!texts.length) return null;
  const start = texts[0].sourceCodeLocation!.startOffset;
  const end = texts[texts.length - 1].sourceCodeLocation!.endOffset;
  return { start, end, text: texts.map((t) => t.value).join("") };
}

export interface HtmlTextEdit {
  file?: string;
  line?: number;
  column?: number;
  oldText: string;
  newText: string;
}

export function applyHtmlTextEdit(
  root: string,
  edit: HtmlTextEdit,
):
  | { ok: true; file: string; line: number; how: "located" | "matched" }
  | { ok: false; reason: string; message: string; candidates?: string[] } {
  const target = normalize(edit.oldText);
  const write = (
    abs: string,
    html: string,
    range: { start: number; end: number },
    raw: string,
    line: number,
    how: "located" | "matched",
  ) => {
    const s = new MagicString(html);
    const lead = /^\s*/.exec(raw)![0];
    const trail = /\s*$/.exec(raw)![0];
    s.overwrite(range.start, range.end, lead + encode(edit.newText.replace(/\r?\n/g, " ")) + trail);
    fs.writeFileSync(abs, s.toString());
    return { ok: true as const, file: path.relative(root, abs).split(path.sep).join("/"), line, how };
  };
  if (edit.file && edit.line != null && edit.column != null) {
    const abs = path.resolve(root, edit.file);
    if (abs.startsWith(path.resolve(root)) && fs.existsSync(abs)) {
      const html = fs.readFileSync(abs, "utf8");
      const el = elementAt(html, edit.line, edit.column);
      const r = el && textRange(el);
      if (r && r !== "composite" && normalize(decode(r.text)) === target)
        return write(abs, html, r, r.text, edit.line, "located");
      if (r && r !== "composite") {
        // A word or phrase inside the element's text (sites that split text into spans for animations).
        const sub = findSubstring(r.text, edit.oldText);
        if (sub)
          return write(
            abs,
            html,
            { start: r.start + sub.start, end: r.start + sub.end },
            r.text.slice(sub.start, sub.end),
            edit.line,
            "located",
          );
      }
      if (r === "composite")
        return {
          ok: false,
          reason: "composite",
          message: "This text is mixed with other elements. Click the inner piece of text.",
        };
    }
  }
  const hits: { abs: string; html: string; range: { start: number; end: number; text: string }; line: number }[] = [];
  for (const abs of listFiles(root, (n) => n.endsWith(".html"))) {
    const html = fs.readFileSync(abs, "utf8");
    if (!html.includes(target.slice(0, Math.min(20, target.length)))) continue;
    for (const el of elements(parseHtml(html))) {
      const r = textRange(el);
      if (r && r !== "composite" && normalize(decode(r.text)) === target)
        hits.push({ abs, html, range: r, line: el.sourceCodeLocation!.startTag!.startLine });
    }
  }
  if (hits.length === 1)
    return write(hits[0].abs, hits[0].html, hits[0].range, hits[0].range.text, hits[0].line, "matched");
  if (hits.length > 1)
    return {
      ok: false,
      reason: "ambiguous",
      message: `This text appears ${hits.length} times.`,
      candidates: hits.map((h) => `${path.relative(root, h.abs)}:${h.line}`),
    };
  return {
    ok: false,
    reason: "dynamic",
    message: "This text is not written as-is in the HTML. It is probably set by a script.",
  };
}

export type HtmlAttrChange = { name: string; value: string | null };

/** Rewrite attributes of the element at file:line:col. Returns the new HTML or null when the element is missing. */
export function updateHtmlAttributes(
  html: string,
  line: number,
  column: number,
  changes: HtmlAttrChange[],
): string | null {
  const el = elementAt(html, line, column);
  if (!el) return null;
  const s = new MagicString(html);
  const locs = el.sourceCodeLocation!.attrs ?? {};
  const st = el.sourceCodeLocation!.startTag!;
  const inserts: string[] = [];
  for (const c of changes) {
    const loc = locs[c.name];
    const rendered = c.value === null ? null : `${c.name}="${c.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`;
    if (loc) {
      if (rendered === null) {
        let start = loc.startOffset;
        while (start > 0 && /\s/.test(html[start - 1])) start--;
        s.remove(start, loc.endOffset);
      } else s.overwrite(loc.startOffset, loc.endOffset, rendered);
    } else if (rendered) inserts.push(rendered);
  }
  if (inserts.length) {
    const closeAt = html[st.endOffset - 2] === "/" ? st.endOffset - 2 : st.endOffset - 1;
    s.appendLeft(closeAt, " " + inserts.join(" "));
  }
  return s.toString();
}

export function htmlAttr(root: string, file: string, line: number, column: number, name: string): string | null {
  const abs = path.resolve(root, file);
  const el = elementAt(fs.readFileSync(abs, "utf8"), line, column);
  return el?.attrs.find((a) => a.name === name)?.value ?? null;
}

export function applyHtmlClassEdit(
  root: string,
  edit: { file?: string; line?: number; column?: number; remove: string[]; add: string[] },
) {
  if (!edit.file || edit.line == null || edit.column == null)
    return { ok: false as const, message: "Element not found." };
  const abs = path.resolve(root, edit.file);
  const html = fs.readFileSync(abs, "utf8");
  const current = htmlAttr(root, edit.file, edit.line, edit.column, "class") ?? "";
  const tokens = current
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !edit.remove.includes(t));
  for (const t of edit.add) if (!tokens.includes(t)) tokens.push(t);
  const out = updateHtmlAttributes(html, edit.line, edit.column, [{ name: "class", value: tokens.join(" ") }]);
  if (out === null) return { ok: false as const, message: "Element not found." };
  fs.writeFileSync(abs, out);
  return {
    ok: true as const,
    file: edit.file,
    line: edit.line,
    missing: edit.remove.filter((t) => !current.split(/\s+/).includes(t)),
  };
}

const INLINE_HTML = new Set([
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
  "svg",
  "img",
]);

type HtmlPart = { text: string } | { tag: string; locator?: string; text: string; void?: boolean };

export function applyHtmlCompositeEdit(
  root: string,
  edit: { file?: string; line?: number; column?: number; parts: HtmlPart[] },
): { ok: true; file: string; line: number } | { ok: false; message: string } {
  if (!edit.file || edit.line == null || edit.column == null)
    return { ok: false, message: "Cannot locate this element in the HTML." };
  const abs = path.resolve(root, edit.file);
  const html = fs.readFileSync(abs, "utf8");
  const el = elementAt(html, edit.line, edit.column);
  if (!el || !el.sourceCodeLocation?.endTag) return { ok: false, message: "Element not found in the HTML." };
  const byPos = new Map<string, Element>();
  for (const k of el.childNodes) {
    if ("tagName" in k) {
      const c = k as Element;
      if (!INLINE_HTML.has(c.tagName))
        return { ok: false, message: "This text mixes block elements. Click a single piece of text instead." };
      const st = c.sourceCodeLocation!.startTag!;
      byPos.set(`${st.startLine}:${st.startCol - 1}`, c);
    }
  }
  const regionStart = el.sourceCodeLocation.startTag!.endOffset;
  const regionEnd = el.sourceCodeLocation.endTag.startOffset;
  const region = html.slice(regionStart, regionEnd);
  const lead = /^\s*/.exec(region)![0];
  const trail = /\s*$/.exec(region)![0];
  const out: string[] = [];
  for (const part of edit.parts) {
    if (!("tag" in part)) {
      out.push(encode(part.text.replace(/\r?\n/g, " ")));
      continue;
    }
    const m = part.locator ? /:(\d+):(\d+)$/.exec(part.locator) : null;
    const original = m ? byPos.get(`${m[1]}:${m[2]}`) : null;
    if (!original) {
      if (part.tag === "br") {
        out.push("<br>");
        continue;
      }
      if (/^(strong|em|b|i|u|s|mark|code)$/.test(part.tag)) {
        out.push(`<${part.tag}>${encode(part.text.replace(/\r?\n/g, " "))}</${part.tag}>`);
        continue;
      }
      return { ok: false, message: `Cannot map <${part.tag}> back to the HTML. Click the text inside it instead.` };
    }
    const loc = original.sourceCodeLocation!;
    let src = html.slice(loc.startOffset, loc.endOffset);
    if (!part.void && loc.endTag && original.tagName !== "svg") {
      const r = textRange(original);
      if (r === "composite")
        return { ok: false, message: `The text inside <${part.tag}> is not plain. Click it directly.` };
      const current = r ? normalize(decode(r.text)) : "";
      if (current !== normalize(part.text)) {
        const inner = html.slice(loc.startTag!.endOffset, loc.endTag.startOffset);
        const l2 = /^\s*/.exec(inner)![0];
        const t2 = /\s*$/.exec(inner)![0];
        src =
          html.slice(loc.startOffset, loc.startTag!.endOffset) +
          l2 +
          encode(part.text.replace(/\r?\n/g, " ")) +
          t2 +
          html.slice(loc.endTag.startOffset, loc.endOffset);
      }
    }
    out.push(src);
  }
  const s = new MagicString(html);
  s.overwrite(regionStart, regionEnd, lead + out.join("") + trail);
  fs.writeFileSync(abs, s.toString());
  return { ok: true, file: edit.file, line: edit.line };
}

function htmlOwnLine(html: string, start: number, end: number) {
  let ls = start;
  while (ls > 0 && html[ls - 1] !== "\n") ls--;
  let le = end;
  while (le < html.length && html[le] !== "\n") le++;
  const own = /^\s*$/.test(html.slice(ls, start)) && /^\s*$/.test(html.slice(end, le));
  return {
    start: own ? ls : start,
    end: own ? Math.min(le + 1, html.length) : end,
    indent: html.slice(ls, start).match(/^\s*/)![0],
    own,
  };
}

export function duplicateHtmlElement(root: string, op: { file?: string; line?: number; column?: number }) {
  if (!op.file || op.line == null || op.column == null) return { ok: false as const, message: "Element not found." };
  const abs = path.resolve(root, op.file);
  const html = fs.readFileSync(abs, "utf8");
  const el = elementAt(html, op.line, op.column);
  if (!el) return { ok: false as const, message: "Element not found in the HTML." };
  const loc = el.sourceCodeLocation!;
  const src = html.slice(loc.startOffset, loc.endOffset);
  const line = htmlOwnLine(html, loc.startOffset, loc.endOffset);
  const s = new MagicString(html);
  if (line.own) s.appendLeft(line.end, line.indent + src + "\n");
  else s.appendLeft(loc.endOffset, src);
  fs.writeFileSync(abs, s.toString());
  return { ok: true as const, file: op.file, line: op.line };
}

export function deleteHtmlElement(root: string, op: { file?: string; line?: number; column?: number }) {
  if (!op.file || op.line == null || op.column == null) return { ok: false as const, message: "Element not found." };
  const abs = path.resolve(root, op.file);
  const html = fs.readFileSync(abs, "utf8");
  const el = elementAt(html, op.line, op.column);
  if (!el) return { ok: false as const, message: "Element not found in the HTML." };
  const loc = el.sourceCodeLocation!;
  const line = htmlOwnLine(html, loc.startOffset, loc.endOffset);
  const s = new MagicString(html);
  s.remove(line.start, line.end);
  fs.writeFileSync(abs, s.toString());
  return { ok: true as const, file: op.file, line: op.line };
}
