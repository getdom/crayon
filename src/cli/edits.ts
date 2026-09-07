import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { applyTextEdit, type EditResult, type EditFailure, type TextEdit } from "../writer/index.js";
import { replaceImage, setAlt, type ImageRequest, type FileSnapshot } from "./images.js";
import { applyClassEdit, type ClassEdit } from "../writer/classes.js";
import { applyHtmlTextEdit, applyHtmlClassEdit, applyHtmlCompositeEdit } from "../static/html.js";
import { applyCompositeEdit, type CompositeEdit } from "../writer/composite.js";
import { duplicateElement, deleteElement, type ElementOp } from "../writer/elements.js";
import { duplicateHtmlElement, deleteHtmlElement } from "../static/html.js";
import { countOccurrences, replaceEverywhere } from "../writer/index.js";
import { listSourceFiles } from "../writer/files.js";
import { componentProps, setProp } from "../writer/props.js";
import { setCssProperty, listCssFiles, type CssEdit } from "../writer/css.js";
import { listDataFiles } from "../writer/data.js";
const require_files = () => ({ listSourceFiles });
import { publish as gitPublish, gitInfo, type GitInfo } from "./git.js";

const isHtml = (file?: string) => !!file && file.toLowerCase().endsWith(".html");

interface HistoryEntry {
  label: string;
  snapshots: FileSnapshot[];
}

export class EditSession {
  private history: HistoryEntry[] = [];
  /** Files written since the last publish, with a one-line summary per edit. */
  private pending = new Map<string, string[]>();
  private git: GitInfo | null = null;
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
      this.track(abs, `${result.file}:${result.line} "${edit.oldText.slice(0, 40)}" → "${edit.newText.slice(0, 40)}"`);
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
      for (const snap of result.snapshots) this.track(snap.path, `${result.file} image → ${result.src}`);
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
      if (abs)
        this.track(
          abs,
          `${result.file}:${result.line} classes ${edit.remove.length ? "−" + edit.remove.join(" ") + " " : ""}${edit.add.length ? "+" + edit.add.join(" ") : ""}`,
        );
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

  composite(edit: CompositeEdit & { oldText?: string }) {
    const target = edit.file ?? (edit.childLocator ? edit.childLocator.replace(/:\d+:\d+$/, "") : undefined);
    const abs = target ? path.resolve(this.root, target) : null;
    const before = abs ? this.snap(abs) : null;
    const result =
      isHtml(target) || this.isStatic
        ? applyHtmlCompositeEdit(this.root, edit as any)
        : applyCompositeEdit(this.root, edit);
    if (result.ok) {
      if (before) this.history.push({ label: `${result.file}:${result.line}`, snapshots: [before] });
      const text = edit.parts.map((p) => p.text).join("");
      if (abs)
        this.track(
          abs,
          `${result.file}:${result.line} "${(edit.oldText ?? "").slice(0, 40)}" → "${text.slice(0, 40)}"`,
        );
      console.log(
        `${pc.green("✎")} ${pc.bold(result.file)}:${result.line}  ${pc.dim(JSON.stringify((edit.oldText ?? "").slice(0, 60)))} → ${JSON.stringify(text.slice(0, 60))}${pc.dim("  (mixed content)")}`,
      );
    } else {
      console.log(`${pc.red("✗")} ${result.message}`);
    }
    return result;
  }

  element(kind: "duplicate" | "delete", op: ElementOp) {
    const abs = op.file ? path.resolve(this.root, op.file) : null;
    const before = abs ? this.snap(abs) : null;
    const html = isHtml(op.file) || this.isStatic;
    const result =
      kind === "duplicate"
        ? html
          ? duplicateHtmlElement(this.root, op)
          : duplicateElement(this.root, op)
        : html
          ? deleteHtmlElement(this.root, op)
          : deleteElement(this.root, op);
    if (result.ok) {
      if (before) this.history.push({ label: `${result.file}:${result.line}`, snapshots: [before] });
      if (abs) this.track(abs, `${result.file}:${result.line} ${kind}`);
      console.log(`${pc.green(kind === "duplicate" ? "⧉" : "⌫")} ${pc.bold(result.file)}:${result.line}  ${kind}`);
    } else {
      console.log(`${pc.red("✗")} ${result.message}`);
    }
    return result;
  }

  /** Other places (code + content) carrying the same text, for the "replace everywhere" offer. */
  occurrences(text: string): number {
    const c = countOccurrences(this.root, text);
    return c.code + c.data;
  }

  replaceAll(oldText: string, newText: string) {
    const c = countOccurrences(this.root, oldText);
    const snaps: FileSnapshot[] = [];
    // snapshot every source and content file that contains the text
    for (const file of [...new Set([...this.filesContaining(oldText)])]) {
      const snap = this.snap(file);
      if (snap) snaps.push(snap);
    }
    const result = replaceEverywhere(this.root, oldText, newText);
    if (result.ok) {
      this.history.push({
        label: `replace in ${result.files.length} files`,
        snapshots: snaps.filter((s) =>
          result.files.includes(path.relative(this.root, s.path).split(path.sep).join("/")),
        ),
      });
      for (const rel of result.files)
        this.track(
          path.resolve(this.root, rel),
          `${rel} "${oldText.slice(0, 40)}" → "${newText.slice(0, 40)}" (everywhere)`,
        );
      console.log(
        `${pc.green("✎")} ${result.count} occurrences in ${result.files.join(", ")}  ${pc.dim(JSON.stringify(oldText))} → ${JSON.stringify(newText)}`,
      );
    } else {
      console.log(`${pc.red("✗")} ${result.message}`);
    }
    return { ...result, expected: c.code + c.data };
  }

  private filesContaining(text: string): string[] {
    const { listSourceFiles } = require_files();
    const out: string[] = [];
    const needle = text.trim().slice(0, 24);
    for (const f of listSourceFiles(this.root)) {
      try {
        if (fs.readFileSync(f, "utf8").includes(needle)) out.push(f);
      } catch {}
    }
    for (const f of listDataFiles(this.root)) {
      try {
        if (fs.readFileSync(f, "utf8").includes(needle)) out.push(f);
      } catch {}
    }
    return out;
  }

  props(edit: TextEdit) {
    if (this.isStatic) return { ok: false as const, message: "No components on a plain HTML site." };
    return componentProps(this.root, edit);
  }

  prop(loc: { file: string; line: number; column: number }, name: string, value: string | null) {
    const abs = path.resolve(this.root, loc.file);
    const before = this.snap(abs);
    const result = setProp(this.root, loc, name, value);
    if (result.ok) {
      if (before) this.history.push({ label: `${result.file}:${result.line}`, snapshots: [before] });
      this.track(abs, `${result.file}:${result.line} ${name}=${value ?? "(removed)"}`);
      console.log(
        `${pc.green("🎨")} ${pc.bold(result.file)}:${result.line}  ${name}=${value === null ? pc.dim("removed") : JSON.stringify(value)}`,
      );
    } else {
      console.log(`${pc.red("✗")} ${result.message}`);
    }
    return result;
  }

  css(edit: CssEdit) {
    const snaps = new Map<string, FileSnapshot>();
    for (const f of listCssFiles(this.root)) {
      const snap = this.snap(f);
      if (snap) snaps.set(f, snap);
    }
    const result = setCssProperty(this.root, edit);
    if (result.ok) {
      const abs = path.resolve(this.root, result.file);
      const before = snaps.get(abs);
      if (before) this.history.push({ label: `${result.file}:${result.line}`, snapshots: [before] });
      this.track(abs, `${result.file}:${result.line} ${result.selector} { ${edit.prop}: ${edit.value} }`);
      console.log(
        `${pc.green("🎨")} ${pc.bold(result.file)}:${result.line}  ${result.selector} { ${edit.prop}: ${edit.value} }${result.how === "added" ? pc.dim("  (added)") : ""}`,
      );
    } else {
      console.log(`${pc.red("✗")} ${result.message}`);
    }
    return result;
  }

  get size() {
    return this.history.length;
  }

  get pendingCount() {
    return [...this.pending.values()].reduce((n, l) => n + l.length, 0);
  }

  private track(abs: string, summary: string) {
    const list = this.pending.get(abs) ?? [];
    list.push(summary);
    this.pending.set(abs, list);
  }

  async gitStatus(): Promise<GitInfo> {
    this.git ??= await gitInfo(this.root);
    return this.git;
  }

  /** Commit and push every file Crayon wrote since the last publish. */
  async publish() {
    const files = [...this.pending.keys()].filter((f) => fs.existsSync(f) || true);
    const summary = [...this.pending.values()].flat();
    const r = await gitPublish(this.root, files, summary);
    if (r.ok) {
      this.pending.clear();
      this.history = [];
      console.log(`${pc.green("⇡")} ${r.message}`);
    } else {
      console.log(`${pc.red("✗")} ${r.message}`);
    }
    return r;
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
