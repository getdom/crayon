import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import pc from "picocolors";
import type { Project } from "./detect.js";

const PKG = "crayon-dev";

/** Where this CLI's own package lives (dist/cli.js → package root). */
function ownPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function isInstalled(project: Project): boolean {
  try {
    createRequire(path.join(project.root, "package.json")).resolve(`${PKG}/package.json`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make `crayon-dev/next` resolvable from the project. When the CLI runs from a local checkout
 * (not from node_modules) we symlink it; otherwise we add it as a dev dependency.
 */
export async function install(project: Project): Promise<boolean> {
  const own = ownPackageRoot();
  const target = path.join(project.root, "node_modules", PKG);
  if (!own.includes(`${path.sep}node_modules${path.sep}`)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {}
    fs.symlinkSync(own, target, "dir");
    console.log(pc.green(`✓ linked ${PKG}`) + pc.dim(` → ${own}`));
    return true;
  }
  const cmd = { npm: ["npm", "install", "-D", PKG], pnpm: ["pnpm", "add", "-D", PKG], yarn: ["yarn", "add", "-D", PKG], bun: ["bun", "add", "-d", PKG] }[project.pm];
  console.log(pc.dim(`$ ${cmd.join(" ")}`));
  const r = await execa(cmd[0], cmd.slice(1), { cwd: project.root, stdio: "inherit", reject: false });
  if (r.exitCode !== 0) {
    console.log(pc.red(`Could not install ${PKG}.`));
    return false;
  }
  console.log(pc.green(`✓ ${PKG} added as a dev dependency`));
  return true;
}

export function isConfigured(project: Project): boolean {
  if (!project.configFile) return false;
  const src = fs.readFileSync(project.configFile, "utf8");
  return /crayon/i.test(src);
}

export function manualInstructions(project: Project): string {
  if (project.framework === "next") {
    return [
      `Add Crayon to ${pc.bold(path.basename(project.configFile ?? "next.config.ts"))}:`,
      "",
      pc.cyan(`  import { withCrayon } from "crayon-dev/next";`),
      pc.cyan(`  export default withCrayon(nextConfig);`),
    ].join("\n");
  }
  return [
    `Add Crayon to ${pc.bold(path.basename(project.configFile ?? "vite.config.ts"))}:`,
    "",
    pc.cyan(`  import { crayon } from "crayon-dev/vite";`),
    pc.cyan(`  plugins: [react(), crayon()]`),
  ].join("\n");
}

/** Try to patch the config file in place. Returns false when the shape is not recognised. */
export function patchConfig(project: Project): boolean {
  const file = project.configFile;
  if (!file) return false;
  const src = fs.readFileSync(file, "utf8");
  const isCjs = /module\.exports\s*=/.test(src) && !/export\s+default/.test(src);
  let out: string | null = null;

  if (project.framework === "next") {
    if (isCjs) {
      out = src.replace(/module\.exports\s*=\s*([^;]+);?/, (_m, expr) => `module.exports = withCrayon(${expr.trim()});`);
      out = `const { withCrayon } = require("crayon-dev/next");\n` + out;
    } else if (/export\s+default\s+/.test(src)) {
      out = src.replace(/export\s+default\s+([^;]+);?/, (_m, expr) => `export default withCrayon(${expr.trim()});`);
      out = `import { withCrayon } from "crayon-dev/next";\n` + out;
    }
  } else if (project.framework === "vite") {
    if (/plugins\s*:\s*\[/.test(src)) {
      out = src.replace(/plugins\s*:\s*\[/, "plugins: [crayon(), ");
      out = (isCjs ? `const { crayon } = require("crayon-dev/vite");\n` : `import { crayon } from "crayon-dev/vite";\n`) + out;
    }
  }

  if (!out || out === src) return false;
  fs.writeFileSync(file, out);
  return true;
}

export async function ensureConfigured(project: Project, autoSetup: boolean): Promise<boolean> {
  if (project.framework !== "next" && project.framework !== "vite") return true;
  const installed = isInstalled(project);
  const configured = isConfigured(project);
  if (installed && configured) return true;
  if (!project.configFile) {
    console.log(pc.yellow(`No ${project.framework} config file found.`));
    console.log(manualInstructions(project));
    return false;
  }
  const rel = path.relative(project.root, project.configFile);
  const needs = [!installed && `${PKG} as a dev dependency`, !configured && `one line in ${pc.bold(rel)}`].filter(Boolean).join(" and ");
  let yes = autoSetup;
  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`${pc.bold("Crayon")} needs ${needs}. Set it up now? ${pc.dim("[Y/n] ")}`);
    rl.close();
    yes = answer.trim() === "" || /^y/i.test(answer);
  }
  if (!yes) {
    console.log(manualInstructions(project));
    return false;
  }
  if (!installed && !(await install(project))) return false;
  if (configured) return true;
  if (patchConfig(project)) {
    console.log(pc.green(`✓ ${rel} updated`) + pc.dim(" (inert without Crayon, safe to commit)"));
    return true;
  }
  console.log(pc.yellow(`Could not patch ${rel} automatically.`));
  console.log(manualInstructions(project));
  return false;
}
