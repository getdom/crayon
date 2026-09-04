import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import { listFiles } from "./files.js";

export interface DataHit {
  file: string;
  line: number;
  start: number;
  end: number;
  kind: "json" | "yaml";
  /** For yaml: the quote character used, or "" for a bare value. */
  quote: string;
}

const DATA_EXT = new Set([".json", ".md", ".mdx", ".yml", ".yaml"]);
const SKIP_JSON = /^(package(-lock)?|tsconfig[^/]*|components|\.eslintrc[^/]*|vercel|turbo|biome|jsconfig)\.json$/;

export function listDataFiles(root: string): string[] {
  return listFiles(
    root,
    (name) => DATA_EXT.has(path.extname(name)) && !SKIP_JSON.test(name) && !name.endsWith(".lock"),
  );
}

function yamlValue(raw: string): { value: string; quote: string } {
  const t = raw.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    const inner = t.slice(1, -1);
    return {
      value: t[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner.replace(/''/g, "'"),
      quote: t[0],
    };
  }
  return { value: t, quote: "" };
}

/** Find every JSON string value or YAML scalar (frontmatter for .md/.mdx) equal to `value`. */
export function searchDataFiles(root: string, value: string): DataHit[] {
  const hits: DataHit[] = [];
  for (const file of listDataFiles(root)) {
    let text: string;
    try {
      if (fs.statSync(file).size > 2 * 1024 * 1024) continue;
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes(value.slice(0, Math.min(24, value.length)))) continue;
    const ext = path.extname(file);
    if (ext === ".json") {
      const re = /"(?:[^"\\\n]|\\.)*"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        let parsed: string;
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          continue;
        }
        // skip keys: a key is followed by ':'
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
        if (/^\s*:/.test(after)) continue;
        if (parsed === value)
          hits.push({
            file,
            line: text.slice(0, m.index).split("\n").length,
            start: m.index,
            end: m.index + m[0].length,
            kind: "json",
            quote: '"',
          });
      }
      continue;
    }
    // yaml, or the frontmatter block of markdown
    let region = text;
    let offset = 0;
    if (ext === ".md" || ext === ".mdx") {
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      if (!fm) continue;
      region = fm[1];
      offset = fm.index + fm[0].indexOf(fm[1]);
    }
    const lineRe = /^([ \t]*-?[ \t]*[\w.\-]+:[ \t]+)(.+?)[ \t]*$/gm;
    let lm: RegExpExecArray | null;
    while ((lm = lineRe.exec(region))) {
      const { value: v, quote } = yamlValue(lm[2]);
      if (v !== value) continue;
      const start = offset + lm.index + lm[1].length;
      const end = start + lm[2].trim().length;
      hits.push({ file, line: text.slice(0, start).split("\n").length, start, end, kind: "yaml", quote });
    }
  }
  return hits;
}

function yamlLiteral(value: string, quote: string): string {
  const needsQuote =
    quote !== "" || /[:#\[\]{}&*!|>'"%@`]|^\s|\s$|^(true|false|null|yes|no|~)$|^[\d.+-]/i.test(value) || value === "";
  if (!needsQuote) return value;
  if (quote === "'") return "'" + value.replace(/'/g, "''") + "'";
  return JSON.stringify(value);
}

export function applyDataEdit(hit: DataHit, newValue: string): void {
  const text = fs.readFileSync(hit.file, "utf8");
  const s = new MagicString(text);
  s.overwrite(hit.start, hit.end, hit.kind === "json" ? JSON.stringify(newValue) : yamlLiteral(newValue, hit.quote));
  fs.writeFileSync(hit.file, s.toString());
}
