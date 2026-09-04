#!/usr/bin/env node
process.noDeprecation = true; // http-proxy still uses util._extend
import { defineCommand, runMain } from "citty";
import path from "node:path";
import { createRequire } from "node:module";
import pc from "picocolors";
import open from "open";
import { detectProject } from "./detect.js";
import { ensureConfigured } from "./setup.js";
import { startDevServer } from "./devserver.js";
import { startProxy } from "./proxy.js";
import { EditSession } from "./edits.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const main = defineCommand({
  meta: { name: "crayon", version, description: "Edit your site on the page, write straight to the code." },
  args: {
    dir: { type: "positional", description: "Project directory", default: "." },
    port: { type: "string", description: "Port for the Crayon window", default: "4400" },
    open: { type: "boolean", description: "Open the browser", default: true },
    setup: { type: "boolean", description: "Patch the framework config without asking", default: false },
  },
  async run({ args }) {
    const root = path.resolve(String(args.dir));
    const project = detectProject(root);
    console.log(`${pc.bold("✎ Crayon")} ${pc.dim("·")} ${pc.cyan(project.framework)} ${pc.dim("·")} ${pc.dim(root)}`);

    if (project.framework === "static") {
      console.log(pc.yellow("Plain HTML sites are next on the list. For now Crayon works on Next and Vite projects."));
      process.exit(1);
    }
    if (project.framework === "unknown" || project.devCommand.length === 0) {
      console.log(pc.red("No Next or Vite project found here (no dependency and no dev script)."));
      process.exit(1);
    }

    const ready = await ensureConfigured(project, Boolean(args.setup));
    if (!ready) process.exit(1);

    console.log(pc.dim(`Starting ${project.devCommand.join(" ")} …`));
    let dev;
    try {
      dev = await startDevServer(project);
    } catch (err: any) {
      console.log(pc.red(err.message));
      process.exit(1);
    }

    const session = new EditSession(root);
    const port = Number(args.port);
    let server: import("node:http").Server;
    let actualPort = port;
    try {
      ({ server, port: actualPort } = await startProxy({ target: dev.target, port, session }));
    } catch (err: any) {
      console.log(pc.red(`Could not listen on port ${port}: ${err.message}`));
      dev.stop();
      process.exit(1);
    }
    if (actualPort !== port) console.log(pc.yellow(`Port ${port} is busy, using ${actualPort}.`));

    const url = `http://localhost:${actualPort}`;
    console.log("");
    console.log(`  ${pc.bold(pc.green("Crayon ready"))}  ${pc.underline(url)}  ${pc.dim(`→ ${dev.target}`)}`);
    console.log(pc.dim("  Click any text on the page to edit it. Enter saves, Esc cancels. Ctrl+C stops."));
    console.log("");
    if (args.open) await open(url).catch(() => {});

    const shutdown = () => {
      console.log(pc.dim("\nStopping…"));
      server.close();
      dev.stop();
      setTimeout(() => process.exit(0), 300);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    dev.child.on("exit", () => {
      console.log(pc.yellow("Dev server stopped."));
      server.close();
      process.exit(0);
    });
  },
});

runMain(main);
