import fs from "node:fs";
import path from "node:path";

export type Framework = "next" | "vite" | "static" | "unknown";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface Project {
  root: string;
  framework: Framework;
  pm: PackageManager;
  devCommand: string[];
  configFile: string | null;
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function detectPm(root: string): PackageManager {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "bun.lockb")) || fs.existsSync(path.join(root, "bun.lock"))) return "bun";
  return "npm";
}

function findConfig(root: string, names: string[]): string | null {
  for (const name of names) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function detectProject(root: string): Project {
  const pkg = readJson(path.join(root, "package.json"));
  const pm = detectPm(root);
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const hasDevScript = typeof pkg?.scripts?.dev === "string";
  const run = (script: string) => (pm === "npm" ? ["npm", "run", script] : [pm, "run", script]);
  const exec = (bin: string, ...args: string[]) =>
    pm === "npm" ? ["npx", bin, ...args] : pm === "bun" ? ["bunx", bin, ...args] : [pm, "exec", bin, ...args];

  if (deps.next) {
    return {
      root,
      framework: "next",
      pm,
      devCommand: hasDevScript ? run("dev") : exec("next", "dev"),
      configFile: findConfig(root, ["next.config.ts", "next.config.mjs", "next.config.js", "next.config.cjs"]),
    };
  }
  if (deps.vite) {
    return {
      root,
      framework: "vite",
      pm,
      devCommand: hasDevScript ? run("dev") : exec("vite"),
      configFile: findConfig(root, ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"]),
    };
  }
  if (fs.existsSync(path.join(root, "index.html"))) {
    return { root, framework: "static", pm, devCommand: [], configFile: null };
  }
  return { root, framework: "unknown", pm, devCommand: hasDevScript ? run("dev") : [], configFile: null };
}
