import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import pc from "picocolors";
import type { Project } from "./detect.js";

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
  if (isConfigured(project)) return true;
  if (!project.configFile) {
    console.log(pc.yellow(`No ${project.framework} config file found.`));
    console.log(manualInstructions(project));
    return false;
  }
  const rel = path.relative(project.root, project.configFile);
  let yes = autoSetup;
  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`${pc.bold("Crayon")} needs one line in ${pc.bold(rel)}. Add it now? ${pc.dim("[Y/n] ")}`);
    rl.close();
    yes = answer.trim() === "" || /^y/i.test(answer);
  }
  if (!yes) {
    console.log(manualInstructions(project));
    return false;
  }
  if (patchConfig(project)) {
    console.log(pc.green(`✓ ${rel} updated`) + pc.dim(" (inert without Crayon, safe to commit)"));
    return true;
  }
  console.log(pc.yellow(`Could not patch ${rel} automatically.`));
  console.log(manualInstructions(project));
  return false;
}
