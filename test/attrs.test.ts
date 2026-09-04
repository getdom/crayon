import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { locateElement, updateAttributes } from "../src/writer/attrs.js";
import { parseSource } from "../src/transform/index.js";

let root: string;
const file = (rel: string, code: string) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, code);
  return abs;
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const firstElement = (code: string) => {
  const ast: any = parseSource(code, "x.tsx");
  let el: any;
  const visit = (n: any) => {
    if (el) return;
    if (n?.type === "JSXOpeningElement") el = n;
    for (const k of Object.keys(n ?? {})) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === "string") visit(v);
    }
  };
  visit(ast);
  return el;
};

describe("updateAttributes", () => {
  it("overwrites, inserts inline, and removes", () => {
    const code = `const a = <img src="/a.png" width={10} />;`;
    const out = updateAttributes(code, firstElement(code), [
      { name: "src", value: "/b.png" },
      { name: "alt", value: 'Say "hi"' },
      { name: "width", value: null },
      { name: "height", value: 20 },
    ]);
    expect(out).toBe(`const a = <img src="/b.png" alt="Say &quot;hi&quot;" height={20} />;`);
  });

  it("inserts one attribute per line when the element is multi-line", () => {
    const code = `const a = (\n  <Image\n    src="/logo.png"\n    width={32}\n  />\n);`;
    const out = updateAttributes(code, firstElement(code), [{ name: "alt", value: "Logo" }]);
    expect(out).toBe(`const a = (\n  <Image\n    src="/logo.png"\n    width={32}\n    alt="Logo"\n  />\n);`);
  });
});

describe("locateElement", () => {
  it("finds a host element at its position, and a component by attribute search with ancestors", () => {
    file("a.tsx", `export const A = () => <div><img src="/x.png" /></div>;`);
    file("logo.tsx", `export const Logo = () => <Image src="/logo.png" alt="Fabrique" width={32} height={32} />;`);
    file("page.tsx", `export default () => <header><Logo /></header>;`);
    const byPos = locateElement(root, { file: "a.tsx", line: 1, column: 28, attr: "src", value: "/x.png" });
    expect("ok" in byPos).toBe(false);
    const bySearch = locateElement(root, {
      file: "page.tsx",
      line: 1,
      column: 21,
      ancestors: ["page.tsx:1:21"],
      attr: "src",
      value: "/logo.png",
    });
    expect("ok" in bySearch ? null : path.basename(bySearch.file)).toBe("logo.tsx");
  });

  it("reports a dynamic src", () => {
    file("a.tsx", `export const A = ({ url }) => <img src={url} />;`);
    const r = locateElement(root, { file: "a.tsx", line: 1, column: 30, attr: "src", value: "https://cdn/x.png" });
    expect(r).toMatchObject({ ok: false, reason: "dynamic" });
  });
});
