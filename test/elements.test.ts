import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { duplicateElement, deleteElement } from "../src/writer/elements.js";
import { duplicateHtmlElement, deleteHtmlElement } from "../src/static/html.js";
import { replaceEverywhere, countOccurrences } from "../src/writer/index.js";

let root: string;
const file = (rel: string, code: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), code);
};
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("duplicate and delete", () => {
  it("duplicates a JSX element on its own line and deletes it back", () => {
    file("a.tsx", `const a = (\n  <ul>\n    <li className="x">One</li>\n    <li>Two</li>\n  </ul>\n);`);
    expect(duplicateElement(root, { file: "a.tsx", line: 3, column: 4 })).toMatchObject({ ok: true });
    expect(read("a.tsx")).toBe(
      `const a = (\n  <ul>\n    <li className="x">One</li>\n    <li className="x">One</li>\n    <li>Two</li>\n  </ul>\n);`,
    );
    expect(deleteElement(root, { file: "a.tsx", line: 4, column: 4 })).toMatchObject({ ok: true });
    expect(read("a.tsx")).toBe(`const a = (\n  <ul>\n    <li className="x">One</li>\n    <li>Two</li>\n  </ul>\n);`);
  });

  it("duplicates inline elements in place, and works on HTML", () => {
    file("a.tsx", `const a = <p><b>x</b> y</p>;`);
    duplicateElement(root, { file: "a.tsx", line: 1, column: 13 });
    expect(read("a.tsx")).toBe(`const a = <p><b>x</b><b>x</b> y</p>;`);
    file("index.html", `<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>`);
    duplicateHtmlElement(root, { file: "index.html", line: 2, column: 2 });
    expect(read("index.html")).toBe(`<ul>\n  <li>One</li>\n  <li>One</li>\n  <li>Two</li>\n</ul>`);
    deleteHtmlElement(root, { file: "index.html", line: 3, column: 2 });
    expect(read("index.html")).toBe(`<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>`);
  });
});

describe("replace everywhere", () => {
  it("counts and replaces across code tiers and content files", () => {
    file("a.tsx", `const a = <h1>Acme</h1>; const b = <Card title="Acme" />;`);
    file("nav.ts", `export const nav = [{ label: "Acme" }];`);
    file("content/post.mdx", `---\ntitle: Acme\n---\n`);
    expect(countOccurrences(root, "Acme")).toEqual({ code: 3, data: 1 });
    const r = replaceEverywhere(root, "Acme", "Acme Inc");
    expect(r).toMatchObject({ ok: true, count: 4 });
    expect(read("a.tsx")).toBe(`const a = <h1>Acme Inc</h1>; const b = <Card title="Acme Inc" />;`);
    expect(read("nav.ts")).toContain(`label: "Acme Inc"`);
    expect(read("content/post.mdx")).toContain(`title: Acme Inc`);
  });
});
