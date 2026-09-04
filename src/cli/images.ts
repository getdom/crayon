import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { locateElement, updateAttributes, attrLiteral, type AttrChange } from "../writer/attrs.js";
import { listFiles } from "../writer/files.js";
import { searchDataFiles, applyDataEdit } from "../writer/data.js";
import { imageSize } from "./image-size.js";

export interface ImageRequest {
  file?: string;
  line?: number;
  column?: number;
  ancestors?: string[];
  /** The img's src attribute as seen in the DOM. */
  src: string;
  /** New file: name + base64 data, or a URL to fetch. */
  name?: string;
  data?: string;
  url?: string;
  /** New alt text, when the user changed it. */
  alt?: string;
  currentAlt?: string;
}

export interface FileSnapshot {
  path: string;
  /** null = the file did not exist (undo deletes it). */
  before: Buffer | null;
}

export interface ImageResult {
  ok: true;
  file: string;
  line: number;
  src: string;
  snapshots: FileSnapshot[];
  note?: string;
  /** The page must reload to show the change (content files are read at request time). */
  reload?: boolean;
}
export interface ImageFailure {
  ok: false;
  message: string;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i;

function slug(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base =
    path
      .basename(name, path.extname(name))
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
  return base + ext;
}

function uniquePath(dir: string, name: string): string {
  let candidate = path.join(dir, name);
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base}-${i}${ext}`);
  return candidate;
}

/** Decode what the DOM src points at: the literal path in the code, or an imported asset. */
function decodeSrc(
  src: string,
):
  | { kind: "public"; path: string }
  | { kind: "imported"; base: string; ext: string }
  | { kind: "remote"; url: string }
  | { kind: "unknown" } {
  try {
    if (src.startsWith("/_next/image")) {
      const u = new URL(src, "http://x");
      const inner = u.searchParams.get("url");
      if (inner) return decodeSrc(inner);
    }
  } catch {}
  const media = /^\/_next\/static\/media\/(.+?)\.[a-f0-9]{6,}(\.[a-z0-9]+)$/i.exec(src);
  if (media) return { kind: "imported", base: media[1], ext: media[2] };
  if (/^https?:\/\//i.test(src)) return { kind: "remote", url: src };
  if (src.startsWith("/") && !src.startsWith("//")) return { kind: "public", path: src.split("?")[0] };
  return { kind: "unknown" };
}

async function bytesOf(req: ImageRequest): Promise<{ buf: Buffer; name: string } | ImageFailure> {
  if (req.data) {
    return { buf: Buffer.from(req.data, "base64"), name: req.name || "image.png" };
  }
  if (req.url) {
    try {
      const res = await fetch(req.url);
      if (!res.ok) return { ok: false, message: `Could not download the image (${res.status}).` };
      const buf = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type") ?? "";
      let name = path.basename(new URL(req.url).pathname) || "image";
      if (!IMAGE_EXT.test(name))
        name += type.includes("jpeg")
          ? ".jpg"
          : type.includes("webp")
            ? ".webp"
            : type.includes("gif")
              ? ".gif"
              : type.includes("svg")
                ? ".svg"
                : ".png";
      return { buf, name };
    } catch (err: any) {
      return { ok: false, message: `Could not download the image: ${err.message}` };
    }
  }
  return { ok: false, message: "No image provided." };
}

function snapshot(p: string): FileSnapshot {
  return { path: p, before: fs.existsSync(p) ? fs.readFileSync(p) : null };
}

export async function replaceImage(root: string, req: ImageRequest): Promise<ImageResult | ImageFailure> {
  const got = await bytesOf(req);
  if ("ok" in got) return got;
  const { buf, name } = got;
  if (buf.length > 5 * 1024 * 1024)
    console.log(pc.yellow(`  image is ${(buf.length / 1024 / 1024).toFixed(1)} MB, consider compressing it`));
  const dims = imageSize(buf);
  const decoded = decodeSrc(req.src);
  const snapshots: FileSnapshot[] = [];
  const publicDir = path.join(root, "public");

  // 1. Imported asset (`import hero from "./hero.png"`): replace the file on disk, keep the name.
  if (decoded.kind === "imported") {
    const matches = listFiles(root, (n) => n.toLowerCase() === (decoded.base + decoded.ext).toLowerCase(), 10);
    if (matches.length !== 1)
      return {
        ok: false,
        message: matches.length
          ? `Several files are named ${decoded.base}${decoded.ext}.`
          : `Could not find the imported file ${decoded.base}${decoded.ext}.`,
      };
    const target = matches[0];
    if (path.extname(name).toLowerCase() !== decoded.ext.toLowerCase()) {
      return {
        ok: false,
        message: `The current image is ${decoded.ext} and the new one is ${path.extname(name)}. Use the same format, or change the import in the code.`,
      };
    }
    snapshots.push(snapshot(target));
    fs.writeFileSync(target, buf);
    const rel = path.relative(root, target).split(path.sep).join("/");
    let note: string | undefined;
    if (req.alt != null && req.alt !== req.currentAlt)
      note = "alt text not changed: the image is imported, edit alt in the code";
    console.log(`${pc.green("🖼")} ${pc.bold(rel)}  replaced (${dims ? `${dims.width}×${dims.height}` : "?"})`);
    return { ok: true, file: rel, line: 0, src: req.src, snapshots, note };
  }

  if (decoded.kind === "unknown")
    return { ok: false, message: `Cannot tell where this image comes from (${req.src.slice(0, 60)}).` };

  // 2. Find the element that carries src="<literal>".
  const literal = decoded.kind === "public" ? decoded.path : decoded.url;
  const found = locateElement(root, {
    file: req.file,
    line: req.line,
    column: req.column,
    ancestors: req.ancestors,
    attr: "src",
    value: literal,
  });
  if ("ok" in found) {
    // The path may live in content: JSON, YAML or markdown frontmatter.
    const data = searchDataFiles(root, literal);
    if (data.length === 1) {
      const dir =
        decoded.kind === "public" ? path.join(publicDir, path.dirname(decoded.path)) : path.join(publicDir, "images");
      fs.mkdirSync(dir, { recursive: true });
      const dest = uniquePath(dir, slug(name));
      snapshots.push({ path: dest, before: null });
      fs.writeFileSync(dest, buf);
      const newSrc = "/" + path.relative(publicDir, dest).split(path.sep).join("/");
      snapshots.push(snapshot(data[0].file));
      applyDataEdit(data[0], newSrc);
      let note: string | undefined;
      if (req.alt != null && req.alt !== req.currentAlt) {
        const alts = req.currentAlt ? searchDataFiles(root, req.currentAlt) : [];
        if (alts.length === 1) applyDataEdit(alts[0], req.alt);
        else note = "alt text not changed: could not find it in the content file";
      }
      const rel = path.relative(root, data[0].file).split(path.sep).join("/");
      console.log(
        `${pc.green("🖼")} ${pc.bold(rel)}:${data[0].line}  ${literal} → ${newSrc}${pc.dim("  (content file)")}`,
      );
      return { ok: true, file: rel, line: data[0].line, src: newSrc, snapshots, note, reload: true };
    }
    if (data.length > 1)
      return {
        ok: false,
        message: `${literal} is used in ${data.length} content files: ${data.map((d) => path.relative(root, d.file)).join(", ")}`,
      };
    return { ok: false, message: found.message + (found.candidates ? ` (${found.candidates.join(", ")})` : "") };
  }

  // 3. Write the new file next to the current one (or in public/images for remote images).
  const dir =
    decoded.kind === "public" ? path.join(publicDir, path.dirname(decoded.path)) : path.join(publicDir, "images");
  fs.mkdirSync(dir, { recursive: true });
  const dest = uniquePath(dir, slug(name));
  snapshots.push({ path: dest, before: null });
  fs.writeFileSync(dest, buf);
  const newSrc = "/" + path.relative(publicDir, dest).split(path.sep).join("/");

  // 4. Rewrite src, alt, and width/height when they are literals and the size changed.
  const changes: AttrChange[] = [{ name: "src", value: newSrc }];
  if (req.alt != null && req.alt !== req.currentAlt) changes.push({ name: "alt", value: req.alt });
  const el = found.element;
  const w = attrLiteral(el, "width");
  const h = attrLiteral(el, "height");
  let note: string | undefined;
  if (dims && w && h && /^\d+$/.test(w) && /^\d+$/.test(h)) {
    const oldW = Number(w);
    const oldH = Number(h);
    const oldRatio = oldW / oldH;
    const newRatio = dims.width / dims.height;
    if (Math.abs(oldRatio - newRatio) > 0.01) {
      // keep the rendered width, fix the height to the new ratio
      const newH = Math.round(oldW / newRatio);
      changes.push({ name: "height", value: newH });
      note = `height ${oldH} → ${newH} to match the new image ratio`;
    }
  }
  const code = fs.readFileSync(found.file, "utf8");
  snapshots.push({ path: found.file, before: Buffer.from(code) });
  fs.writeFileSync(found.file, updateAttributes(code, el, changes));
  const rel = path.relative(root, found.file).split(path.sep).join("/");
  console.log(`${pc.green("🖼")} ${pc.bold(rel)}:${found.line}  src → ${newSrc}${note ? pc.dim("  " + note) : ""}`);
  return { ok: true, file: rel, line: found.line, src: newSrc, snapshots, note };
}

/** Change only the alt text of an image. */
export function setAlt(root: string, req: ImageRequest): ImageResult | ImageFailure {
  const decoded = decodeSrc(req.src);
  let found;
  if (decoded.kind === "public" || decoded.kind === "remote") {
    const literal = decoded.kind === "public" ? decoded.path : decoded.url;
    found = locateElement(root, {
      file: req.file,
      line: req.line,
      column: req.column,
      ancestors: req.ancestors,
      attr: "src",
      value: literal,
    });
  } else if (req.currentAlt) {
    found = locateElement(root, {
      file: req.file,
      line: req.line,
      column: req.column,
      ancestors: req.ancestors,
      attr: "alt",
      value: req.currentAlt,
    });
  } else {
    return { ok: false, message: "Cannot find this image in the code to change its alt text." };
  }
  if ("ok" in found) return { ok: false, message: found.message };
  const code = fs.readFileSync(found.file, "utf8");
  fs.writeFileSync(found.file, updateAttributes(code, found.element, [{ name: "alt", value: req.alt ?? "" }]));
  const rel = path.relative(root, found.file).split(path.sep).join("/");
  console.log(`${pc.green("🖼")} ${pc.bold(rel)}:${found.line}  alt → ${JSON.stringify(req.alt ?? "")}`);
  return {
    ok: true,
    file: rel,
    line: found.line,
    src: req.src,
    snapshots: [{ path: found.file, before: Buffer.from(code) }],
  };
}
