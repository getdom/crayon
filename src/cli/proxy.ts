import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import httpProxy from "http-proxy";
import { WebSocketServer, type WebSocket } from "ws";
import type { EditSession } from "./edits.js";
import { readTheme, type Theme } from "./theme.js";
import { serveStatic } from "../static/server.js";

const OVERLAY_PATH = "/__crayon/overlay.js";
const THEME_PATH = "/__crayon/theme";
const WS_PATH = "/__crayon/ws";

function overlaySource(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, "overlay.global.js"), "utf8");
}

function inject(html: string): string {
  const tag = `<script src="${OVERLAY_PATH}" defer></script>`;
  if (html.includes(OVERLAY_PATH)) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, tag + "</head>");
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, tag + "</body>");
  return html + tag;
}

function decode(buf: Buffer, encoding?: string): Buffer {
  switch ((encoding ?? "").toLowerCase()) {
    case "gzip":
      return zlib.gunzipSync(buf);
    case "deflate":
      return zlib.inflateSync(buf);
    case "br":
      return zlib.brotliDecompressSync(buf);
    default:
      return buf;
  }
}

export interface ProxyOptions {
  /** Dev server to proxy. When absent, the project root is served as a static site. */
  target?: string;
  port: number;
  root: string;
  session: EditSession;
  onClient?: (count: number) => void;
}

export interface ProxyHandle {
  server: http.Server;
  port: number;
}

/** Listen on the requested port, or the next free one within a small range. */
function listen(server: http.Server, port: number, attempts = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (p: number, left: number) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener("error", onError);
        if (err.code === "EADDRINUSE" && left > 0) tryPort(p + 1, left - 1);
        else reject(err);
      };
      server.once("error", onError);
      server.listen(p, "127.0.0.1", () => {
        server.removeListener("error", onError);
        resolve(p);
      });
    };
    tryPort(port, attempts);
  });
}

export function startProxy(opts: ProxyOptions): Promise<ProxyHandle> {
  const overlay = overlaySource();
  const staticHandler = opts.target ? null : serveStatic(opts.root, inject);
  const proxy = httpProxy.createProxyServer({
    target: opts.target ?? "http://127.0.0.1:1",
    ws: true,
    selfHandleResponse: true,
    xfwd: false,
  });

  proxy.on("proxyReq", (proxyReq) => {
    proxyReq.removeHeader("accept-encoding");
  });

  proxy.on("proxyRes", (proxyRes, req, res) => {
    const type = String(proxyRes.headers["content-type"] ?? "");
    const isHtml = type.includes("text/html");
    const headers = { ...proxyRes.headers };
    delete headers["content-security-policy"];
    delete headers["content-security-policy-report-only"];
    if (!isHtml) {
      res.writeHead(proxyRes.statusCode ?? 200, headers);
      proxyRes.pipe(res);
      return;
    }
    const chunks: Buffer[] = [];
    proxyRes.on("data", (c: Buffer) => chunks.push(c));
    proxyRes.on("end", () => {
      const raw = decode(Buffer.concat(chunks), headers["content-encoding"] as string | undefined);
      const html = inject(raw.toString("utf8"));
      delete headers["content-encoding"];
      delete headers["content-length"];
      delete headers["transfer-encoding"];
      headers["content-length"] = String(Buffer.byteLength(html));
      res.writeHead(proxyRes.statusCode ?? 200, headers);
      res.end(html);
    });
  });

  proxy.on("error", (err, _req, res) => {
    const r = res as http.ServerResponse;
    if (r && typeof r.writeHead === "function" && !r.headersSent) {
      r.writeHead(502, { "content-type": "text/plain" });
      r.end(`Crayon could not reach the dev server at ${opts.target}: ${err.message}`);
    }
  });

  let theme: Theme | null = null;
  const server = http.createServer((req, res) => {
    if (req.url === THEME_PATH) {
      theme ??= readTheme(opts.root);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(theme));
      return;
    }
    if (req.url === OVERLAY_PATH) {
      res.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" });
      res.end(overlay);
      return;
    }
    if (staticHandler) staticHandler(req, res);
    else proxy.web(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    opts.onClient?.(clients.size);
    ws.on("close", () => {
      clients.delete(ws);
      opts.onClient?.(clients.size);
    });
    ws.on("message", (data) => {
      let msg: any;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === "edit") {
        const result = opts.session.text({
          file: msg.file,
          line: msg.line,
          column: msg.column,
          ancestors: Array.isArray(msg.ancestors) ? msg.ancestors.slice(0, 40) : [],
          oldText: msg.oldText,
          newText: msg.newText,
        });
        ws.send(
          JSON.stringify({
            type: "result",
            id: msg.id,
            ...result,
            history: opts.session.size,
            pending: opts.session.pendingCount,
          }),
        );
      } else if (msg.type === "composite") {
        const result = opts.session.composite({
          file: msg.file,
          line: msg.line,
          column: msg.column,
          childLocator: msg.childLocator,
          parts: Array.isArray(msg.parts) ? msg.parts.slice(0, 200) : [],
          oldText: msg.oldText,
        });
        ws.send(
          JSON.stringify({
            type: "result",
            id: msg.id,
            ...result,
            history: opts.session.size,
            pending: opts.session.pendingCount,
          }),
        );
      } else if (msg.type === "image") {
        opts.session
          .image({
            file: msg.file,
            line: msg.line,
            column: msg.column,
            ancestors: Array.isArray(msg.ancestors) ? msg.ancestors.slice(0, 40) : [],
            src: String(msg.src ?? ""),
            name: msg.name,
            data: msg.data,
            url: msg.url,
            alt: msg.alt,
            currentAlt: msg.currentAlt,
          })
          .then((result) =>
            ws.send(JSON.stringify({ type: "result", id: msg.id, ...result, history: opts.session.size })),
          );
      } else if (msg.type === "class") {
        const result = opts.session.classes({
          file: msg.file,
          line: msg.line,
          column: msg.column,
          remove: Array.isArray(msg.remove) ? msg.remove.map(String) : [],
          add: Array.isArray(msg.add) ? msg.add.map(String) : [],
        });
        ws.send(
          JSON.stringify({
            type: "result",
            id: msg.id,
            ...result,
            history: opts.session.size,
            pending: opts.session.pendingCount,
          }),
        );
      } else if (msg.type === "undo") {
        const r = opts.session.undo();
        ws.send(
          JSON.stringify({ type: "undone", ...r, history: opts.session.size, pending: opts.session.pendingCount }),
        );
      } else if (msg.type === "publish") {
        opts.session.publish().then((r) =>
          ws.send(
            JSON.stringify({
              type: "published",
              id: msg.id,
              ...r,
              history: opts.session.size,
              pending: opts.session.pendingCount,
            }),
          ),
        );
      } else if (msg.type === "ping") {
        opts.session
          .gitStatus()
          .then((git) =>
            ws.send(
              JSON.stringify({ type: "pong", history: opts.session.size, pending: opts.session.pendingCount, git }),
            ),
          );
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === WS_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else if (staticHandler) {
      socket.destroy();
    } else {
      proxy.ws(req, socket, head);
    }
  });

  return listen(server, opts.port).then((port) => ({ server, port }));
}
