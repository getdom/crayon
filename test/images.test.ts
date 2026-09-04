import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EditSession } from "../src/cli/edits.js";
import { imageSize } from "../src/cli/image-size.js";

let root: string;
const file = (rel: string, code: string | Buffer) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, code);
  return abs;
};
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

/** A 1×1 or w×h PNG header is enough for imageSize; body bytes do not matter here. */
function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  b.write("\x89PNG\r\n\x1a\n", 0, "binary");
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("imageSize", () => {
  it("reads PNG dimensions", () => {
    expect(imageSize(png(640, 480))).toEqual({ width: 640, height: 480 });
  });
});

describe("replace image", () => {
  it("writes the file next to the current one, updates src, alt and height, and undoes", async () => {
    file("public/img/old.png", png(100, 100));
    file(
      "src/hero.tsx",
      `export const Hero = () => (\n  <Image\n    src="/img/old.png"\n    alt="Old"\n    width={200}\n    height={200}\n  />\n);`,
    );
    const session = new EditSession(root);
    const r = await session.image({
      file: "src/hero.tsx",
      line: 2,
      column: 2,
      src: "/_next/image?url=%2Fimg%2Fold.png&w=256&q=75",
      name: "My New Photo.png",
      data: png(400, 200).toString("base64"),
      alt: "New",
      currentAlt: "Old",
    });
    expect(r).toMatchObject({ ok: true, file: "src/hero.tsx", src: "/img/my-new-photo.png" });
    expect(fs.existsSync(path.join(root, "public/img/my-new-photo.png"))).toBe(true);
    expect(read("src/hero.tsx")).toBe(
      `export const Hero = () => (\n  <Image\n    src="/img/my-new-photo.png"\n    alt="New"\n    width={200}\n    height={100}\n  />\n);`,
    );
    expect(session.undo().ok).toBe(true);
    expect(fs.existsSync(path.join(root, "public/img/my-new-photo.png"))).toBe(false);
    expect(read("src/hero.tsx")).toContain(`src="/img/old.png"`);
  });

  it("overwrites an imported asset in place and refuses a format change", async () => {
    file("src/assets/hero.png", png(10, 10));
    file("src/page.tsx", `import hero from "./assets/hero.png";\nexport default () => <img src={hero} alt="" />;`);
    const session = new EditSession(root);
    const ok = await session.image({
      src: "/_next/static/media/hero.3f2a9c1b.png",
      name: "x.png",
      data: png(20, 20).toString("base64"),
    });
    expect(ok).toMatchObject({ ok: true, file: "src/assets/hero.png" });
    expect(imageSize(fs.readFileSync(path.join(root, "src/assets/hero.png")))).toEqual({ width: 20, height: 20 });
    const bad = await session.image({
      src: "/_next/static/media/hero.3f2a9c1b.png",
      name: "x.jpg",
      data: png(20, 20).toString("base64"),
    });
    expect(bad.ok).toBe(false);
  });

  it("refuses a dynamic src with a clear message", async () => {
    file("src/a.tsx", `export const A = ({ logo }) => <img src={logo} alt="Org" />;`);
    const session = new EditSession(root);
    const r = await session.image({
      file: "src/a.tsx",
      line: 1,
      column: 31,
      src: "https://cdn.example.com/logo.png",
      name: "n.png",
      data: png(1, 1).toString("base64"),
    });
    expect(r.ok).toBe(false);
    expect(String(r.message)).toMatch(/expression/);
  });

  it("changes only the alt text", async () => {
    file("src/a.tsx", `export const A = () => <img src="/a.png" />;`);
    const session = new EditSession(root);
    const r = await session.image({
      file: "src/a.tsx",
      line: 1,
      column: 23,
      src: "/a.png",
      alt: "A picture",
      currentAlt: "",
    });
    expect(r.ok).toBe(true);
    expect(read("src/a.tsx")).toBe(`export const A = () => <img src="/a.png" alt="A picture" />;`);
  });
});
