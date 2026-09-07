import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseCss, selectorMatches, setCssProperty, readCssVars } from "../src/writer/css.js";

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

const css = `:root { --blue: #1b4dff; --ink: #f4f7ff; }
/* buttons */
.btn {
  display: inline-flex;
  padding: 0 24px;
}
.btn--primary {
  background: var(--blue); color: #fff;
}
.btn--primary:hover { background: var(--blue-2); }
@media (max-width: 600px) {
  .btn { padding: 0 12px; }
}
button { font: inherit }
`;

describe("css writer", () => {
  it("parses rules, nested media and declarations", () => {
    const rules = parseCss(css);
    expect(rules.map((r) => r.selector)).toEqual([
      ":root",
      ".btn",
      ".btn--primary",
      ".btn--primary:hover",
      ".btn",
      "button",
    ]);
    expect(rules[2].declarations.map((d) => [d.prop, d.value])).toEqual([
      ["background", "var(--blue)"],
      ["color", "#fff"],
    ]);
  });

  it("matches compound selectors and skips pseudo states", () => {
    const el = { tag: "button", classes: ["btn", "btn--primary"] };
    expect(selectorMatches(".btn--primary", el)).toBeGreaterThan(0);
    expect(selectorMatches(".btn--primary:hover", el)).toBeNull();
    expect(selectorMatches(".card .btn", el)).toBeGreaterThan(selectorMatches(".btn", el)!);
    expect(selectorMatches(".btn--ghost", el)).toBeNull();
    expect(selectorMatches("a.btn", el)).toBeNull();
  });

  it("updates the most specific rule that sets the property, else adds it", () => {
    file("src/style.css", css);
    const el = { tag: "button", classes: ["btn", "btn--primary", "btn--lg"] };
    const r1 = setCssProperty(root, { el, prop: "background-color", value: "var(--ink)" });
    expect(r1).toMatchObject({ ok: true, selector: ".btn--primary", how: "updated", file: "src/style.css" });
    expect(read("src/style.css")).toContain(`.btn--primary {\n  background: var(--ink); color: #fff;\n}`);
    const r2 = setCssProperty(root, { el, prop: "border-radius", value: "12px" });
    expect(r2).toMatchObject({ ok: true, selector: ".btn--primary", how: "added" });
    expect(read("src/style.css")).toContain(`color: #fff;\n  border-radius: 12px;\n}`);
    expect(readCssVars(root)).toEqual({ blue: "#1b4dff", ink: "#f4f7ff" });
  });
});
