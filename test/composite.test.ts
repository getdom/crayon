import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyCompositeEdit } from "../src/writer/composite.js";
import { applyHtmlCompositeEdit } from "../src/static/html.js";

let root: string;
const file = (rel: string, code: string) => fs.writeFileSync(path.join(root, rel), code);
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("composite text", () => {
  it("rebuilds JSX children, keeping inline elements and their attributes", () => {
    file(
      "a.tsx",
      `const a = (\n  <p className="x">\n    Hello <b className="y">world</b>, see <a href="/x">this</a>.\n  </p>\n);`,
    );
    const r = applyCompositeEdit(root, {
      file: "a.tsx",
      line: 2,
      column: 2,
      parts: [
        { text: "Hi " },
        { tag: "b", locator: "a.tsx:3:10", text: "everyone" },
        { text: ", see " },
        { tag: "a", locator: "a.tsx:3:42", text: "this" },
        { text: "!" },
      ],
    });
    expect(r).toMatchObject({ ok: true, line: 2 });
    expect(read("a.tsx")).toBe(
      `const a = (\n  <p className="x">\n    Hi <b className="y">everyone</b>, see <a href="/x">this</a>!\n  </p>\n);`,
    );
  });

  it("targets the parent of a tagged child when the element itself is rendered by a component", () => {
    file(
      "page.tsx",
      `export default () => (\n  <Reveal as="h1">\n    Un divorce, c'est une fin.<br />\n    C'est aussi un début.\n  </Reveal>\n);`,
    );
    const r = applyCompositeEdit(root, {
      childLocator: "page.tsx:3:30",
      parts: [
        { text: "Un divorce, c'est une fin." },
        { tag: "br", locator: "page.tsx:3:30", text: "", void: true },
        { text: "C'est aussi, doucement, un début." },
      ],
    });
    expect(r).toMatchObject({ ok: true, file: "page.tsx" });
    expect(read("page.tsx")).toBe(
      `export default () => (\n  <Reveal as="h1">\n    Un divorce, c'est une fin.<br />C'est aussi, doucement, un début.\n  </Reveal>\n);`,
    );
  });

  it("refuses dynamic children", () => {
    file("a.tsx", `const a = <p>Total: {n} <b>items</b></p>;`);
    const r = applyCompositeEdit(root, { file: "a.tsx", line: 1, column: 10, parts: [{ text: "x" }] });
    expect(r.ok).toBe(false);
  });

  it("rebuilds HTML children", () => {
    file("index.html", `<h1 class="rise">The <em>one-command</em><br>cloud computer<br>for AI agents.</h1>`);
    const r = applyHtmlCompositeEdit(root, {
      file: "index.html",
      line: 1,
      column: 0,
      parts: [
        { text: "The " },
        { tag: "em", locator: "index.html:1:21", text: "one-command" },
        { tag: "br", locator: "index.html:1:40", text: "", void: true },
        { text: "cloud computer " },
        { text: "for your agents." },
      ],
    });
    expect(r.ok).toBe(true);
    expect(read("index.html")).toBe(
      `<h1 class="rise">The <em>one-command</em><br>cloud computer for your agents.</h1>`,
    );
  });
});
