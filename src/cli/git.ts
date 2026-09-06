import path from "node:path";
import { execa } from "execa";

export interface GitInfo {
  repo: boolean;
  branch?: string;
  upstream?: string;
  remoteUrl?: string;
}

async function git(root: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  const r = await execa("git", args, { cwd: root, reject: false });
  return { ok: r.exitCode === 0, out: (r.stdout + (r.stderr ? "\n" + r.stderr : "")).trim() };
}

export async function gitInfo(root: string): Promise<GitInfo> {
  const top = await git(root, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { repo: false };
  const branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).out;
  const up = await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const remote = await git(root, ["remote", "get-url", "origin"]);
  return { repo: true, branch, upstream: up.ok ? up.out : undefined, remoteUrl: remote.ok ? remote.out : undefined };
}

export interface PublishResult {
  ok: boolean;
  message: string;
  sha?: string;
  branch?: string;
  pushed?: boolean;
  files?: string[];
}

/** Commit the given files with the user's git identity, then push when the branch tracks a remote. */
export async function publish(root: string, files: string[], summary: string[]): Promise<PublishResult> {
  const info = await gitInfo(root);
  if (!info.repo) return { ok: false, message: "This project is not a git repository." };
  const rel = [...new Set(files.map((f) => path.relative(root, f).split(path.sep).join("/")))];
  if (!rel.length) return { ok: false, message: "Nothing to publish." };
  const add = await git(root, ["add", "-A", "--", ...rel]);
  if (!add.ok) return { ok: false, message: `git add failed: ${add.out}` };
  const staged = await git(root, ["diff", "--cached", "--quiet", "--", ...rel]);
  if (staged.ok)
    return { ok: false, message: "No changes left to commit. Everything was undone or already published." };
  const n = summary.length;
  const title = n === 1 ? `Content: ${summary[0].slice(0, 60)}` : `Content: ${n} edits`;
  const body = summary.map((s) => `- ${s}`).join("\n");
  const commit = await git(root, ["commit", "-q", "-m", title, "-m", body, "--", ...rel]);
  if (!commit.ok) return { ok: false, message: `git commit failed: ${commit.out.split("\n").pop()}` };
  const sha = (await git(root, ["rev-parse", "--short", "HEAD"])).out;
  if (!info.upstream) {
    return {
      ok: true,
      message: `Committed ${sha} on ${info.branch}. No remote branch to push to.`,
      sha,
      branch: info.branch,
      pushed: false,
      files: rel,
    };
  }
  const push = await git(root, ["push", "-q"]);
  if (!push.ok)
    return {
      ok: true,
      message: `Committed ${sha} on ${info.branch}, but push failed: ${push.out.split("\n").pop()}`,
      sha,
      branch: info.branch,
      pushed: false,
      files: rel,
    };
  return {
    ok: true,
    message: `Committed and pushed ${sha} on ${info.branch}.`,
    sha,
    branch: info.branch,
    pushed: true,
    files: rel,
  };
}
