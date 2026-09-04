import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { applyTextEdit, type EditResult, type EditFailure } from "../writer/index.js";

interface Snapshot {
  file: string;
  before: string;
  label: string;
}

export class EditSession {
  private history: Snapshot[] = [];
  constructor(private root: string) {}

  text(edit: { file?: string; line?: number; column?: number; ancestors?: string[]; oldText: string; newText: string }): EditResult | EditFailure {
    const before = this.snapshotFor(edit.file);
    const result = applyTextEdit(this.root, edit);
    if (result.ok) {
      const abs = path.resolve(this.root, result.file);
      const previous = before?.file === abs ? before.before : this.readSafe(abs, edit, result);
      if (previous != null) this.history.push({ file: abs, before: previous, label: `${result.file}:${result.line}` });
      console.log(`${pc.green("✎")} ${pc.bold(result.file)}:${result.line}  ${pc.dim(JSON.stringify(edit.oldText))} → ${JSON.stringify(edit.newText)}${result.how === "matched" ? pc.dim("  (found by text)") : ""}`);
    } else {
      console.log(`${pc.red("✗")} ${result.message}${result.candidates ? pc.dim(" " + result.candidates.join(", ")) : ""}`);
    }
    return result;
  }

  undo(): { ok: boolean; label?: string } {
    const last = this.history.pop();
    if (!last) return { ok: false };
    fs.writeFileSync(last.file, last.before);
    console.log(`${pc.yellow("↶")} undo ${last.label}`);
    return { ok: true, label: last.label };
  }

  get size() {
    return this.history.length;
  }

  private snapshotFor(rel?: string): Snapshot | null {
    if (!rel) return null;
    const abs = path.resolve(this.root, rel);
    try {
      return { file: abs, before: fs.readFileSync(abs, "utf8"), label: rel };
    } catch {
      return null;
    }
  }

  /** The writer may have edited a different file than the located one (text-search fallback). Rebuild "before" from the result. */
  private readSafe(abs: string, edit: { oldText: string; newText: string }, result: EditResult): string | null {
    try {
      const after = fs.readFileSync(abs, "utf8");
      const idx = after.indexOf(edit.newText);
      if (idx < 0) return null;
      return after.slice(0, idx) + edit.oldText + after.slice(idx + edit.newText.length);
    } catch {
      return null;
    }
  }
}
