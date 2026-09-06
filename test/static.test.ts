import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tagHtml, applyHtmlTextEdit, updateHtmlAttributes, applyHtmlClassEdit } from "../src/static/html.js";
import { resolveStatic } from "../src/static/server.js";

let root: string;
const file = (rel: string, code: string) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, code);
};
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("static html", () => {
  it("tags elements with file:line:col and skips head/script", () => {
    const html = `<!doctype html>\n<html><head><title>T</title></head>\n<body>\n  <h1 class="rise">Hello</h1>\n  <img src="a.png">\n</body></html>`;
    const out = tagHtml(html, "index.html");
    expect(out).toContain(`<h1 data-crayon="index.html:4:2" class="rise">Hello</h1>`);
    expect(out).toContain(`<img data-crayon="index.html:5:2" src="a.png">`);
    expect(out).not.toContain(`<title data-crayon`);
  });

  it("edits text at the tagged position, keeping whitespace and encoding", () => {
    file("index.html", `<body>\n  <p>\n    Old &amp; plain\n  </p>\n</body>`);
    const r = applyHtmlTextEdit(root, {
      file: "index.html",
      line: 2,
      column: 2,
      oldText: "Old & plain",
      newText: "New <b>",
    });
    expect(r).toMatchObject({ ok: true, how: "located" });
    expect(read("index.html")).toBe(`<body>\n  <p>\n    New &lt;b&gt;\n  </p>\n</body>`);
  });

  it("replaces a single word inside the element's text", () => {
    file("index.html", `<p class="sub">In the 90s, a modem connected your computer\n      to the Internet.</p>`);
    const r = applyHtmlTextEdit(root, {
      file: "index.html",
      line: 1,
      column: 0,
      oldText: "connected",
      newText: "plugged",
    });
    expect(r).toMatchObject({ ok: true, how: "located" });
    expect(read("index.html")).toBe(
      `<p class="sub">In the 90s, a modem plugged your computer\n      to the Internet.</p>`,
    );
  });

  it("falls back to a unique text search across pages", () => {
    file("index.html", `<body><a>Contact</a></body>`);
    file("about.html", `<body><a>About</a></body>`);
    const r = applyHtmlTextEdit(root, { oldText: "About", newText: "About us" });
    expect(r).toMatchObject({ ok: true, how: "matched", file: "about.html" });
  });

  it("updates, inserts and removes attributes, and swaps classes", () => {
    const html = `<img class="a b" src="x.png">`;
    expect(
      updateHtmlAttributes(html, 1, 0, [
        { name: "src", value: "y.png" },
        { name: "alt", value: 'Say "hi"' },
      ]),
    ).toBe(`<img class="a b" src="y.png" alt="Say &quot;hi&quot;">`);
    file("index.html", html);
    const r = applyHtmlClassEdit(root, { file: "index.html", line: 1, column: 0, remove: ["a", "zz"], add: ["c"] });
    expect(r).toMatchObject({ ok: true, missing: ["zz"] });
    expect(read("index.html")).toBe(`<img class="b c" src="x.png">`);
  });

  it("resolves clean URLs", () => {
    file("index.html", "");
    file("about.html", "");
    file("docs/index.html", "");
    expect(path.basename(resolveStatic(root, "/")!)).toBe("index.html");
    expect(path.basename(resolveStatic(root, "/about")!)).toBe("about.html");
    expect(resolveStatic(root, "/docs/")!.endsWith("docs/index.html")).toBe(true);
    expect(resolveStatic(root, "/../etc/passwd")).toBe(null);
  });
});

describe("vite config patch", () => {
  it("adds a plugins array when the config has none", async () => {
    const { patchConfig } = await import("../src/cli/setup.js");
    file(
      "vite.config.js",
      `import { defineConfig } from "vite";\n\nexport default defineConfig({\n  build: { target: "es2020" },\n});\n`,
    );
    const ok = patchConfig({
      root,
      framework: "vite",
      pm: "npm",
      devCommand: ["vite"],
      configFile: path.join(root, "vite.config.js"),
    });
    expect(ok).toBe(true);
    expect(read("vite.config.js")).toBe(
      `import { crayon } from "crayon-dev/vite";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [crayon()],\n  build: { target: "es2020" },\n});\n`,
    );
  });
});
