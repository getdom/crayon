import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execaSync } from "execa";
import { publish, gitInfo } from "../src/cli/git.js";
import { EditSession } from "../src/cli/edits.js";

let root: string;
let bare: string;
const g = (cwd: string, ...args: string[]) => execaSync("git", args, { cwd }).stdout.trim();
beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-git-"));
  bare = path.join(tmp, "remote.git");
  root = path.join(tmp, "site");
  execaSync("git", ["init", "-q", "--bare", bare]);
  execaSync("git", ["clone", "-q", bare, root]);
  g(root, "config", "user.name", "Test");
  g(root, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(root, "index.html"), `<body><h1>Hello</h1></body>`);
  g(root, "add", "-A");
  g(root, "commit", "-q", "-m", "init");
  g(root, "push", "-q", "-u", "origin", "HEAD");
});
afterEach(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

describe("publish", () => {
  it("commits the files Crayon wrote and pushes to the upstream", async () => {
    const session = new EditSession(root, true);
    session.text({ file: "index.html", line: 1, column: 6, oldText: "Hello", newText: "Bonjour" });
    expect(session.pendingCount).toBe(1);
    const r = await session.publish();
    expect(r).toMatchObject({ ok: true, pushed: true, branch: expect.any(String) });
    expect(g(root, "log", "-1", "--format=%s")).toBe('Content: index.html:1 "Hello" → "Bonjour"');
    expect(g(bare, "log", "-1", "--format=%s")).toContain("Content:");
    expect(session.pendingCount).toBe(0);
    expect(session.size).toBe(0);
  });

  it("reports nothing to publish after an undo, and no repo outside git", async () => {
    const session = new EditSession(root, true);
    session.text({ file: "index.html", line: 1, column: 6, oldText: "Hello", newText: "Bonjour" });
    session.undo();
    const r = await session.publish();
    expect(r.ok).toBe(false);
    const info = await gitInfo(os.tmpdir());
    expect(info.repo).toBe(false);
    expect((await publish(os.tmpdir(), ["x"], ["x"])).ok).toBe(false);
  });
});
