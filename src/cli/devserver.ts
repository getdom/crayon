import { execa, type ResultPromise } from "execa";
import pc from "picocolors";
import type { Project } from "./detect.js";

export interface DevServer {
  child: ResultPromise;
  target: string;
  stop: () => void;
}

const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)/;

export function startDevServer(project: Project, timeoutMs = 90_000): Promise<DevServer> {
  const [cmd, ...args] = project.devCommand;
  const child = execa(cmd, args, {
    cwd: project.root,
    env: { ...process.env, CRAYON: "1", CRAYON_ROOT: project.root, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    reject: false,
    forceKillAfterDelay: 3000,
  });

  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) reject(new Error("Dev server did not print a local URL within 90s."));
    }, timeoutMs);

    const stop = () => {
      if (!child.killed) child.kill("SIGTERM");
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text.split("\n").filter(Boolean).map((l) => pc.dim("│ ") + l).join("\n") + "\n");
      if (done) return;
      const m = URL_RE.exec(text.replace(/\x1b\[[0-9;]*m/g, ""));
      if (m) {
        done = true;
        clearTimeout(timer);
        resolve({ child, target: `http://localhost:${m[1]}`, stop });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error(`Dev server exited with code ${code} before it was ready.`));
      }
    });
  });
}
