import { describe, it, expect } from "vitest";
import { addSourceAttributes } from "../src/transform/index.js";

describe("addSourceAttributes", () => {
  it("tags host elements and leaves components alone", () => {
    const code = `export default function Hero() {\n  return (\n    <section className="p-4">\n      <Button>Go</Button>\n      <p>Hello</p>\n    </section>\n  );\n}\n`;
    const out = addSourceAttributes(code, "/proj/app/page.tsx", "/proj");
    expect(out.count).toBe(2);
    expect(out.code).toContain('<section data-crayon="app/page.tsx:3:4" className="p-4">');
    expect(out.code).toContain('<p data-crayon="app/page.tsx:5:6">Hello</p>');
    expect(out.code).toContain("<Button>Go</Button>");
  });

  it("handles self-closing and typed elements", () => {
    const out = addSourceAttributes(`const a = <img src="x" />;\nconst b = <br/>;`, "/p/a.tsx", "/p");
    expect(out.code).toBe(
      `const a = <img data-crayon="a.tsx:1:10" src="x" />;\nconst b = <br data-crayon="a.tsx:2:10"/>;`,
    );
  });

  it("skips files without JSX", () => {
    const out = addSourceAttributes(`export const x = 1;`, "/p/a.ts", "/p");
    expect(out.count).toBe(0);
  });
});
