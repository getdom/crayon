import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { componentProps, setProp, variantsOf } from "../src/writer/props.js";

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

const button = `import { cva } from "class-variance-authority";
const buttonVariants = cva("inline-flex", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      outline: "border bg-background",
      ghost: "hover:bg-accent",
    },
    size: { default: "h-9 px-4", sm: "h-8 px-3", lg: "h-10 px-6" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({ variant, size, children }) { return <button className={buttonVariants({ variant, size })}>{children}</button>; }`;

describe("component variants", () => {
  it("reads cva variant groups", () => {
    expect(variantsOf(button)).toEqual({ variant: ["default", "outline", "ghost"], size: ["default", "sm", "lg"] });
  });

  it("finds the component element for a rendered text, resolves @/ imports, and sets a prop", () => {
    file("src/components/ui/button.tsx", button);
    file(
      "src/app/page.tsx",
      `import { Button } from "@/components/ui/button";\nexport default () => (\n  <main>\n    <Button size="sm">Book a call</Button>\n  </main>\n);`,
    );
    const r = componentProps(root, {
      file: "src/components/ui/button.tsx",
      line: 14,
      column: 55,
      oldText: "Book a call",
      newText: "Book a call",
    });
    expect(r).toMatchObject({
      ok: true,
      component: "Button",
      file: "src/app/page.tsx",
      line: 4,
      definition: "src/components/ui/button.tsx",
      current: { size: "sm" },
    });
    if (!r.ok) return;
    setProp(root, { file: r.file, line: r.line, column: r.column }, "variant", "outline");
    expect(read("src/app/page.tsx")).toContain(`<Button size="sm" variant="outline">Book a call</Button>`);
    setProp(root, { file: r.file, line: r.line, column: r.column }, "size", null);
    expect(read("src/app/page.tsx")).toContain(`<Button variant="outline">Book a call</Button>`);
  });
});
