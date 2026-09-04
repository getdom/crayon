import { normalize } from "./jsx-text.js";

/**
 * Find `needle` inside `raw` source text, tolerant to whitespace and line breaks.
 * Returns the raw range when the needle occurs exactly once as a whole-word match, else null.
 */
export function findSubstring(raw: string, needle: string): { start: number; end: number } | null {
  const target = normalize(needle);
  if (!target) return null;
  const pattern = target
    .split(" ")
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s\\u00a0]+");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, "gu");
  const matches = [...raw.matchAll(re)];
  if (matches.length !== 1) return null;
  const m = matches[0];
  const start = m.index! + m[1].length;
  return { start, end: start + m[2].length };
}
