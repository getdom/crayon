import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { applyTextEdit, type EditResult, type EditFailure, type TextEdit } from "../writer/index.js";
import { replaceImage, setAlt, type ImageRequest, type FileSnapshot } from "./images.js";
import { applyClassEdit, type ClassEdit } from "../writer/classes.js";
import { applyHtmlTextEdit, applyHtmlClassEdit } from "../static/html.js";

const isHtml = (file?: string) => !!file && file.toLowerCase().endsWith(".html");

interface HistoryEntry {
  label: string;
  snapshots: FileSnapshot[];
}

export class EditSession {
  private history: HistoryEntry[] = [];
  constructor(
    private root: string,
    /** Plain HTML site: no framework, files are edited directly. */
    private isStatic: boolean = false,
  ) {}

  text(edit: TextEdit): EditResult | EditFailure {
    // Snapshot every file that could be touched: the located one, and we re-derive after for text-search fallbacks.
    const before = edit.file ? this.snap(path.resolve(this.root, edit.file)) : null;
    const result = (
      isHtml(edit.file) || this.isStatic ? applyHtmlTextEdit(this.root, edit) : applyTextEdit(this.root, edit)
    ) as EditResult | EditFailure;
    if (result.ok) {
      const abs = path.resolve(this.root, result.file);
      const snapshot = before && before.path === abs ? before : this.rebuild(abs, edit);
      if (snapshot) this.history.push({ label: `${result.file}:${result.line}`, snapshots: [snapshot] });
      console.log(
        `${pc.green("✎")} ${pc.bold(result.file)}:${result.line}  ${pc.dim(JSON.stringify(edit.oldText))} → ${JSON.stringify(edit.newText)}${result.how === "matched" ? pc.dim("  (found by text)") : ""}`,
      );
    } else {
      console.log(
        `${pc.red("✗")} ${result.message}${result.candidates ? pc.dim(" " + result.candidates.join(", ")) : ""}`,
      );
    }
    return result;
  }

  async image(req: ImageRequest) {
    const result = req.data || req.url ? await replaceImage(this.root, req) : setAlt(this.root, req);
    if (result.ok) {
      this.history.push({
        label: `${result.file}${result.line ? ":" + result.line : ""}`,
        snapshots: result.snapshots,
      });
    } else {
      console.log(`${pc.red("✗")} ${result.message}`);
    }
    const { snapshots: _s, ...rest } = result as any;
    return rest;
  }

  classes(edit: ClassEdit) {
    const abs = edit.file ? path.resolve(this.root, edit.file) : null;
    const before = abs ? this.snap(abs) : null;
    const result = isHtml(edit.file) ? applyHtmlClassEdit(this.root, edit) : applyClassEdit(this.root, edit);
    if (result.ok) {
      if (before) this.history.push({ label: `${result.file}:${result.line}`, snapshots: [before] });
      console.log(
        `${pc.green("🎨")} ${pc.bold(result.file)}:${result.line}  ${edit.remove.length ? pc.dim("−" + edit.remove.join(" ")) + " " : ""}${edit.add.length ? "+" + edit.add.join(" ") : ""}${result.missing.length ? pc.yellow("  not found: " + result.missing.join(" ")) : ""}`,
      );
    } else {
      console.log(`${pc.red("✗")} ${result.message}`);
    }
    return result;
  }

  undo(): { ok: boolean; label?: string } {
    const last = this.history.pop();
    if (!last) return { ok: false };
    for (const snap of [...last.snapshots].reverse()) {
      if (snap.before === null) fs.rmSync(snap.path, { force: true });
      else fs.writeFileSync(snap.path, snap.before);
    }
    console.log(`${pc.yellow("↶")} undo ${last.label}`);
    return { ok: true, label: last.label };
  }

  get size() {
    return this.history.length;
  }

  private snap(abs: string): FileSnapshot | null {
    try {
      return { path: abs, before: fs.readFileSync(abs) };
    } catch {
      return null;
    }
  }

  /** The writer may have edited a different file than the located one. Rebuild "before" from the result. */
  private rebuild(abs: string, edit: TextEdit): FileSnapshot | null {
    try {
      const after = fs.readFileSync(abs, "utf8");
      const idx = after.indexOf(edit.newText);
      if (idx < 0) return null;
      return {
        path: abs,
        before: Buffer.from(after.slice(0, idx) + edit.oldText + after.slice(idx + edit.newText.length)),
      };
    } catch {
      return null;
    }
  }
}
