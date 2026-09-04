import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { tagHtml } from "./html.js";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};

/** Resolve a URL path to a file inside root: /, /about, /about/, /about.html, /about/index.html. */
export function resolveStatic(root: string, urlPath: string): string | null {
  const p = decodeURIComponent(urlPath.split("?")[0]);
  if (p.includes("\0")) return null;
  const candidates = [p, p.replace(/\/$/, "") + ".html", path.posix.join(p, "index.html")];
  for (const c of candidates) {
    const abs = path.resolve(root, "." + c);
    if (!abs.startsWith(path.resolve(root))) return null;
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

/** Serve a static folder, tagging HTML files with data-crayon and injecting the overlay tag. */
export function serveStatic(root: string, inject: (html: string) => string): http.RequestListener {
  return (req, res) => {
    const abs = resolveStatic(root, req.url ?? "/");
    if (!abs) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const type = TYPES[ext] ?? "application/octet-stream";
    if (ext === ".html") {
      const rel = path.relative(root, abs).split(path.sep).join("/");
      const html = inject(tagHtml(fs.readFileSync(abs, "utf8"), rel));
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "no-store",
        "content-length": String(Buffer.byteLength(html)),
      });
      res.end(html);
      return;
    }
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    fs.createReadStream(abs).pipe(res);
  };
}
