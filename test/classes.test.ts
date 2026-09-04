import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyClassEdit } from "../src/writer/classes.js";

let root: string;
const file = (rel: string, code: string) => fs.writeFileSync(path.join(root, rel), code);
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("applyClassEdit", () => {
  it("swaps tokens in a plain className", () => {
    file("a.tsx", `const a = <p className="text-sm text-gray-500 mt-2">x</p>;`);
    const r = applyClassEdit(root, {
      file: "a.tsx",
      line: 1,
      column: 10,
      remove: ["text-sm", "text-gray-500"],
      add: ["text-lg", "text-primary", "font-semibold"],
    });
    expect(r).toMatchObject({ ok: true, missing: [] });
    expect(read("a.tsx")).toBe(`const a = <p className="mt-2 text-lg text-primary font-semibold">x</p>;`);
  });

  it("works inside cn() and reports tokens it cannot find", () => {
    file("a.tsx", `const a = <p className={cn("text-sm", active && "font-bold", className)}>x</p>;`);
    const r = applyClassEdit(root, {
      file: "a.tsx",
      line: 1,
      column: 10,
      remove: ["text-sm", "italic"],
      add: ["text-base"],
    });
    expect(r).toMatchObject({ ok: true, missing: ["italic"] });
    expect(read("a.tsx")).toBe(`const a = <p className={cn("text-base", active && "font-bold", className)}>x</p>;`);
  });

  it("adds a className when there is none, and refuses CSS modules", () => {
    file("a.tsx", `const a = <p>x</p>;\nconst b = <p className={styles.lede}>y</p>;`);
    applyClassEdit(root, { file: "a.tsx", line: 1, column: 10, remove: [], add: ["italic"] });
    expect(read("a.tsx")).toContain(`<p className="italic">x</p>`);
    const r = applyClassEdit(root, { file: "a.tsx", line: 2, column: 10, remove: [], add: ["italic"] });
    expect(r.ok).toBe(false);
    expect(String((r as any).message)).toMatch(/CSS module/);
  });
});
