import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyTextEdit } from "../src/writer/index.js";
import { renderJsxText } from "../src/writer/jsx-text.js";

let root: string;
const file = (rel: string, code: string) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, code);
  return abs;
};
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("renderJsxText", () => {
  it("collapses like React", () => {
    expect(renderJsxText("\n      Hello\n      world\n    ")).toBe("Hello world");
    expect(renderJsxText("Bonjour &amp; bienvenue")).toBe("Bonjour & bienvenue");
  });
});

describe("applyTextEdit", () => {
  it("edits a multi-line JSX text at the located element and keeps indentation", () => {
    file(
      "app/page.tsx",
      `export default function P() {\n  return (\n    <h1 className="x">\n      Bonjour le monde\n    </h1>\n  );\n}\n`,
    );
    const r = applyTextEdit(root, {
      file: "app/page.tsx",
      line: 3,
      column: 4,
      oldText: "Bonjour le monde",
      newText: "Salut à tous",
    });
    expect(r).toMatchObject({ ok: true, how: "located", file: "app/page.tsx", line: 4 });
    expect(read("app/page.tsx")).toContain(`<h1 className="x">\n      Salut à tous\n    </h1>`);
  });

  it("encodes characters forbidden in JSX text", () => {
    file("a.tsx", `const a = <p>Prix</p>;`);
    applyTextEdit(root, { file: "a.tsx", line: 1, column: 10, oldText: "Prix", newText: "Prix < 10 {HT}" });
    expect(read("a.tsx")).toBe(`const a = <p>Prix &lt; 10 &#123;HT&#125;</p>;`);
  });

  it("edits a string literal in an expression container", () => {
    file("a.tsx", `const a = <p>{'Hello'}</p>;`);
    applyTextEdit(root, { file: "a.tsx", line: 1, column: 10, oldText: "Hello", newText: `It's "new"` });
    expect(read("a.tsx")).toBe(`const a = <p>{'It\\'s "new"'}</p>;`);
  });

  it("falls back to a unique text match when the element is a component child", () => {
    file("components/button.tsx", `export function Button({ children }) { return <button>{children}</button>; }`);
    file(
      "app/page.tsx",
      `import { Button } from "../components/button";\nexport default () => <Button>Réserver</Button>;`,
    );
    const r = applyTextEdit(root, {
      file: "components/button.tsx",
      line: 1,
      column: 47,
      oldText: "Réserver",
      newText: "Réserver maintenant",
    });
    expect(r).toMatchObject({ ok: true, how: "matched", file: "app/page.tsx" });
    expect(read("app/page.tsx")).toContain("<Button>Réserver maintenant</Button>");
  });

  it("reports ambiguity and dynamic text", () => {
    file("a.tsx", `const a = <p>Voir</p>; const b = <span>Voir</span>;`);
    file("b.tsx", `const c = <p>{title}</p>;`);
    expect(applyTextEdit(root, { oldText: "Voir", newText: "Lire" })).toMatchObject({ ok: false, reason: "ambiguous" });
    expect(
      applyTextEdit(root, { file: "b.tsx", line: 1, column: 10, oldText: "Mon titre", newText: "X" }),
    ).toMatchObject({ ok: false, reason: "dynamic" });
  });

  it("finds text passed as a JSX attribute", () => {
    file(
      "field.tsx",
      `export function Field({ label, children }) { return <label><span>{label}</span>{children}</label>; }`,
    );
    file(
      "page.tsx",
      `import { Field } from "./field";\nexport default () => <Field label="Commune" className="Commune"><input /></Field>;`,
    );
    const r = applyTextEdit(root, { file: "field.tsx", line: 1, column: 57, oldText: "Commune", newText: "Ville" });
    expect(r).toMatchObject({ ok: true, how: "matched", file: "page.tsx" });
    expect(read("page.tsx")).toContain(`<Field label="Ville" className="Commune">`);
  });

  it("finds text inside a conditional expression and prefers JSX text over other literals", () => {
    file(
      "a.tsx",
      `const a = <div>{ok ? "Projet finançable" : "Projet hors budget"}</div>;\nconst tag = "Projet finançable";`,
    );
    const r = applyTextEdit(root, {
      file: "a.tsx",
      line: 1,
      column: 10,
      oldText: "Projet finançable",
      newText: "Projet OK",
    });
    expect(r).toMatchObject({ ok: true, how: "matched" });
    expect(read("a.tsx")).toBe(
      `const a = <div>{ok ? "Projet OK" : "Projet hors budget"}</div>;\nconst tag = "Projet finançable";`,
    );
  });

  it("uses DOM ancestors to pick between identical props", () => {
    file("field.tsx", `export function Field({ label }) { return <label><span>{label}</span></label>; }`);
    file(
      "page.tsx",
      `import { Field } from "./field";\nexport default () => (\n  <main>\n    <section>\n      <Field label="Surface" />\n    </section>\n    <section>\n      <Field label="Surface" />\n    </section>\n  </main>\n);`,
    );
    const r = applyTextEdit(root, {
      file: "field.tsx",
      line: 1,
      column: 44,
      ancestors: ["page.tsx:7:4", "page.tsx:3:2"],
      oldText: "Surface",
      newText: "Superficie",
    });
    expect(r).toMatchObject({ ok: true, how: "matched", file: "page.tsx", line: 8 });
    expect(read("page.tsx")).toContain(
      `<Field label="Surface" />\n    </section>\n    <section>\n      <Field label="Superficie" />`,
    );
  });

  it("ignores imports, object keys and classNames", () => {
    file("a.tsx", `import x from "Voir";\nconst o = { "Voir": 1 };\nconst b = <p className="Voir">{t}</p>;`);
    expect(applyTextEdit(root, { oldText: "Voir", newText: "Lire" })).toMatchObject({ ok: false, reason: "dynamic" });
  });

  it("replaces a word inside a JSX text node", () => {
    file("a.tsx", `const a = <p>\n  Ship faster with\n  fewer meetings.\n</p>;`);
    const r = applyTextEdit(root, {
      file: "a.tsx",
      line: 1,
      column: 10,
      oldText: "fewer meetings.",
      newText: "no meetings.",
    });
    expect(r).toMatchObject({ ok: true, how: "located" });
    expect(read("a.tsx")).toBe(`const a = <p>\n  Ship faster with\n  no meetings.\n</p>;`);
  });

  it("prefers the i18n dictionary entry matching the rendered expression path", () => {
    file("messages/fr.ts", `export const fr = { hero: { title: "Arrêtez de courir", sub: "x" } };`);
    file("og.tsx", `export default () => <h1>Arrêtez de courir</h1>;`);
    file("landing.tsx", `export const L = ({ dict }) => <h1 className="x">{dict.hero.title}</h1>;`);
    const r = applyTextEdit(root, {
      file: "landing.tsx",
      line: 1,
      column: 31,
      oldText: "Arrêtez de courir",
      newText: "Respirez",
    });
    expect(r).toMatchObject({ ok: true, how: "matched", file: "messages/fr.ts" });
    expect(read("messages/fr.ts")).toContain(`title: "Respirez"`);
    expect(read("og.tsx")).toContain("Arrêtez de courir");
  });

  it("refuses composite children", () => {
    file("a.tsx", `const a = <p>Hello <b>world</b></p>;`);
    const r = applyTextEdit(root, { file: "a.tsx", line: 1, column: 10, oldText: "Hello world", newText: "X" });
    expect(r.ok).toBe(false);
  });
});
