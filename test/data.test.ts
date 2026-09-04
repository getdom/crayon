import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyTextEdit } from "../src/writer/index.js";
import { EditSession } from "../src/cli/edits.js";

let root: string;
const file = (rel: string, code: string | Buffer) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, code);
};
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("content files", () => {
  it("edits a frontmatter value and a JSON value, keeping quoting sane", () => {
    file("content/a.mdx", `---\ntitle: Vivre après\nimage: /images/a.webp\n---\n# Vivre après\n`);
    file("data/nav.json", `{ "items": [{ "label": "Comprendre", "href": "/comprendre" }] }`);
    file("app/page.tsx", `export default ({ post }) => <h1>{post.title}</h1>;`);
    const r1 = applyTextEdit(root, {
      file: "app/page.tsx",
      line: 1,
      column: 30,
      oldText: "Vivre après",
      newText: "Vivre: après",
    });
    expect(r1).toMatchObject({ ok: true, how: "data", file: "content/a.mdx", line: 2 });
    expect(read("content/a.mdx")).toContain(`title: "Vivre: après"\n`);
    const r2 = applyTextEdit(root, { oldText: "Comprendre", newText: "Comprendre le divorce" });
    expect(r2).toMatchObject({ ok: true, how: "data", file: "data/nav.json" });
    expect(read("data/nav.json")).toContain(`"label": "Comprendre le divorce", "href": "/comprendre"`);
  });

  it("replaces an image whose path lives in frontmatter, and undoes", async () => {
    file("public/images/a.webp", Buffer.from("RIFF"));
    file("content/a.mdx", `---\nimage: /images/a.webp\nimageAlt: Old alt\n---\n`);
    file("components/Parallax.tsx", `export const Parallax = ({ src, alt }) => <img src={src} alt={alt} />;`);
    const session = new EditSession(root);
    const r = await session.image({
      file: "components/Parallax.tsx",
      line: 1,
      column: 45,
      src: "/images/a.webp",
      name: "B Photo.webp",
      data: Buffer.from("RIFF").toString("base64"),
      alt: "New alt",
      currentAlt: "Old alt",
    });
    expect(r).toMatchObject({ ok: true, file: "content/a.mdx", src: "/images/b-photo.webp" });
    expect(read("content/a.mdx")).toBe(`---\nimage: /images/b-photo.webp\nimageAlt: New alt\n---\n`);
    expect(fs.existsSync(path.join(root, "public/images/b-photo.webp"))).toBe(true);
    session.undo();
    expect(read("content/a.mdx")).toContain("image: /images/a.webp");
    expect(fs.existsSync(path.join(root, "public/images/b-photo.webp"))).toBe(false);
  });
});
