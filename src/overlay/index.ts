/* Crayon overlay: injected by the CLI proxy into every HTML page of the dev server. */

const ATTR = "data-crayon";
const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/__crayon/ws`;

type Locator = { file: string; line: number; column: number } | null;

const css = `
:host { all: initial; }
* { box-sizing: border-box; }
.bar {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  height: 34px; padding: 0 6px 0 12px;
  background: #16161a; color: #f4f4f5;
  font: 500 12.5px/1 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  border-radius: 999px; box-shadow: 0 1px 2px rgba(0,0,0,.25), 0 8px 24px rgba(0,0,0,.22);
  z-index: 2147483646; user-select: none; -webkit-user-select: none;
  letter-spacing: .01em; white-space: nowrap;
}
.brand { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #ef4444; transition: background .2s; }
.dot.on { background: #22c55e; }
.sep { width: 1px; height: 16px; background: rgba(255,255,255,.14); }
.status { color: #a1a1aa; width: 300px; overflow: hidden; text-overflow: ellipsis; font-weight: 400; }
.status.ok { color: #86efac; }
.status.err { color: #fca5a5; }
button {
  all: unset; cursor: pointer; height: 24px; padding: 0 10px; border-radius: 999px;
  font: inherit; font-size: 12px; color: #e4e4e7; display: inline-flex; align-items: center; gap: 6px;
}
button:hover { background: rgba(255,255,255,.08); }
button.primary { background: #f4f4f5; color: #16161a; font-weight: 600; }
button.primary.off { background: transparent; color: #a1a1aa; border: 1px solid rgba(255,255,255,.18); }
button:disabled { opacity: .35; cursor: default; }
kbd { font: 10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: #71717a; }
.box {
  position: fixed; pointer-events: none; z-index: 2147483645;
  border: 1.5px solid #6366f1; border-radius: 3px; display: none;
  box-shadow: 0 0 0 1px rgba(255,255,255,.6);
}
.box.editing { border-color: #f59e0b; border-style: solid; box-shadow: 0 0 0 4px rgba(245,158,11,.18); }
.tag {
  position: absolute; left: -1.5px; top: -22px; height: 20px; padding: 0 7px;
  background: #6366f1; color: #fff; border-radius: 4px 4px 0 0;
  font: 500 11px/20px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap;
}
.box.editing .tag { background: #f59e0b; color: #1c1917; }
.box.flip .tag { top: auto; bottom: -22px; border-radius: 0 0 4px 4px; }
`;

class Overlay {
  host = document.createElement("div");
  root = this.host.attachShadow({ mode: "open" });
  bar = document.createElement("div");
  box = document.createElement("div");
  tag = document.createElement("span");
  dot = document.createElement("span");
  status = document.createElement("span");
  toggleBtn = document.createElement("button");
  undoBtn = document.createElement("button");

  ws: WebSocket | null = null;
  enabled = true;
  hovered: Element | null = null;
  editing: HTMLElement | null = null;
  editingOld = "";
  editingLocator: Locator = null;
  pending = new Map<number, (r: any) => void>();
  seq = 0;
  history = 0;
  statusTimer: number | undefined;

  constructor() {
    this.host.id = "crayon-overlay";
    const style = document.createElement("style");
    style.textContent = css;
    this.root.append(style);

    this.bar.className = "bar";
    const brand = document.createElement("span");
    brand.className = "brand";
    this.dot.className = "dot";
    brand.append(this.dot, document.createTextNode("Crayon"));
    const sep = document.createElement("span");
    sep.className = "sep";
    this.status.className = "status";
    this.status.textContent = "Click any text to edit";
    this.toggleBtn.className = "primary";
    this.toggleBtn.innerHTML = `Editing <kbd>⌘E</kbd>`;
    this.toggleBtn.addEventListener("click", () => this.setEnabled(!this.enabled));
    this.undoBtn.textContent = "Undo";
    this.undoBtn.disabled = true;
    this.undoBtn.addEventListener("click", () => this.undo());
    this.bar.append(brand, sep, this.status, this.undoBtn, this.toggleBtn);

    this.box.className = "box";
    this.tag.className = "tag";
    this.box.append(this.tag);
    this.root.append(this.bar, this.box);
    document.documentElement.append(this.host);

    document.addEventListener("mousemove", this.onMove, true);
    document.addEventListener("mouseleave", () => this.hover(null), true);
    document.addEventListener("click", this.onClick, true);
    document.addEventListener("keydown", this.onKey, true);
    window.addEventListener("scroll", () => this.redraw(), true);
    window.addEventListener("resize", () => this.redraw());
    this.connect();
  }

  /* ---------- connection ---------- */
  connect(delay = 0) {
    window.setTimeout(() => {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        this.ws = ws;
        this.dot.classList.add("on");
        ws.send(JSON.stringify({ type: "ping" }));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (typeof msg.history === "number") this.setHistory(msg.history);
        if (msg.type === "result" && this.pending.has(msg.id)) {
          this.pending.get(msg.id)!(msg);
          this.pending.delete(msg.id);
        } else if (msg.type === "undone") {
          this.say(msg.ok ? `↶ Reverted ${msg.label}` : "Nothing to undo", msg.ok ? "ok" : "err");
        }
      };
      ws.onclose = () => {
        this.ws = null;
        this.dot.classList.remove("on");
        this.connect(Math.min(5000, delay + 1000));
      };
      ws.onerror = () => ws.close();
    }, delay);
  }

  send(msg: any): Promise<any> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return resolve({ ok: false, message: "Crayon is not connected. Is the CLI still running?" });
      const id = ++this.seq;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ ...msg, id }));
    });
  }

  /* ---------- state ---------- */
  setEnabled(on: boolean) {
    this.enabled = on;
    this.toggleBtn.classList.toggle("off", !on);
    this.toggleBtn.innerHTML = on ? `Editing <kbd>⌘E</kbd>` : `Browsing <kbd>⌘E</kbd>`;
    if (!on) {
      this.cancelEdit();
      this.hover(null);
      this.say("Browsing mode: clicks go through to the site");
    } else {
      this.say("Click any text to edit");
    }
  }

  setHistory(n: number) {
    this.history = n;
    this.undoBtn.disabled = n === 0;
    this.undoBtn.textContent = n > 0 ? `Undo (${n})` : "Undo";
  }

  say(text: string, kind: "" | "ok" | "err" = "", ms = 4000) {
    this.status.textContent = text;
    this.status.className = "status " + kind;
    window.clearTimeout(this.statusTimer);
    if (kind) {
      this.statusTimer = window.setTimeout(() => {
        this.status.textContent = this.enabled ? "Click any text to edit" : "Browsing mode";
        this.status.className = "status";
      }, ms);
    }
  }

  /* ---------- element helpers ---------- */
  isOurs(el: EventTarget | null): boolean {
    return el instanceof Node && (el === this.host || this.host.contains(el));
  }

  locatorOf(el: Element | null): Locator {
    const owner = el?.closest(`[${ATTR}]`);
    const v = owner?.getAttribute(ATTR);
    const m = v && /^(.*):(\d+):(\d+)$/.exec(v);
    return m ? { file: m[1], line: Number(m[2]), column: Number(m[3]) } : null;
  }

  /** Text-only elements are editable in place. */
  isTextOnly(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    if (["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "SELECT", "IMG", "SVG", "VIDEO", "CANVAS"].includes(el.tagName)) return false;
    if (el.childElementCount > 0) return false;
    return (el.textContent ?? "").trim().length > 0;
  }

  /** From a click target, pick the element to edit: itself if text-only, otherwise the deepest text-only element under the pointer. */
  pickEditable(target: Element, x: number, y: number): HTMLElement | null {
    if (this.isTextOnly(target)) return target as HTMLElement;
    let best: HTMLElement | null = null;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode() as Element | null;
    while (node) {
      if (this.isTextOnly(node)) {
        const r = node.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          best = node as HTMLElement;
        }
      }
      node = walker.nextNode() as Element | null;
    }
    return best;
  }

  /* ---------- hover box ---------- */
  onMove = (e: MouseEvent) => {
    if (!this.enabled || this.editing || this.isOurs(e.target)) return;
    const target = e.target as Element;
    const el = this.isTextOnly(target) ? target : (target.closest(`[${ATTR}]`) ?? null);
    this.hover(el);
  };

  hover(el: Element | null) {
    this.hovered = el;
    this.redraw();
  }

  redraw() {
    const el = this.editing ?? this.hovered;
    if (!el || !this.enabled) {
      this.box.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      this.box.style.display = "none";
      return;
    }
    this.box.style.display = "block";
    this.box.style.left = `${r.left}px`;
    this.box.style.top = `${r.top}px`;
    this.box.style.width = `${r.width}px`;
    this.box.style.height = `${r.height}px`;
    this.box.classList.toggle("editing", !!this.editing);
    this.box.classList.toggle("flip", r.top < 60);
    const loc = this.locatorOf(el);
    const name = el.tagName.toLowerCase();
    const where = loc ? `${name} · ${loc.file.split("/").pop()}:${loc.line}` : name;
    this.tag.textContent = this.editing ? `${where}   ↵ Enter to save · Esc to cancel` : where;
  }

  /* ---------- editing ---------- */
  onClick = (e: MouseEvent) => {
    if (!this.enabled || this.isOurs(e.target)) return;
    if (e.metaKey || e.ctrlKey) return; // let power users click through
    if (this.editing) {
      if (this.editing.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      this.commitEdit();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as Element;
    if (target instanceof HTMLImageElement || target.tagName === "svg") {
      this.say("Images are coming in the next version", "err");
      return;
    }
    const el = this.pickEditable(target, e.clientX, e.clientY);
    if (!el) {
      this.say("No plain text here. Click directly on a piece of text.", "err");
      return;
    }
    this.startEdit(el);
  };

  onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      this.setEnabled(!this.enabled);
      return;
    }
    if (!this.editing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.cancelEdit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.commitEdit();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      // Let the browser handle undo inside the field.
      e.stopPropagation();
    }
  };

  startEdit(el: HTMLElement) {
    this.editing = el;
    this.editingOld = el.textContent ?? "";
    this.editingLocator = this.locatorOf(el);
    this.hovered = null;
    try {
      el.contentEditable = "plaintext-only";
      if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
    } catch {
      el.contentEditable = "true";
    }
    el.spellcheck = false;
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.addEventListener("input", this.redrawSoon);
    el.addEventListener("blur", this.onBlur);
    this.say("Enter to save · Esc to cancel");
    this.redraw();
  }

  redrawSoon = () => requestAnimationFrame(() => this.redraw());

  onBlur = () => {
    // A click elsewhere commits through onClick; blur from tab switches commits too.
    if (this.editing) this.commitEdit();
  };

  finishEdit() {
    const el = this.editing;
    if (!el) return;
    el.removeEventListener("input", this.redrawSoon);
    el.removeEventListener("blur", this.onBlur);
    el.contentEditable = "inherit";
    el.removeAttribute("contenteditable");
    el.removeAttribute("spellcheck");
    window.getSelection()?.removeAllRanges();
    this.editing = null;
    this.redraw();
  }

  cancelEdit() {
    const el = this.editing;
    if (!el) return;
    el.textContent = this.editingOld;
    this.finishEdit();
    this.say("Cancelled");
  }

  async commitEdit() {
    const el = this.editing;
    if (!el) return;
    const newText = (el.textContent ?? "").replace(/ /g, " ");
    const oldText = this.editingOld;
    const locator = this.editingLocator;
    this.finishEdit();
    if (newText.trim() === oldText.trim()) {
      this.say("No change");
      return;
    }
    if (newText.trim() === "") {
      el.textContent = oldText;
      this.say("Empty text is not saved. Delete the element in code if you need to.", "err");
      return;
    }
    this.say("Saving…");
    const r = await this.send({ type: "edit", ...(locator ?? {}), oldText, newText });
    if (r.ok) {
      this.say(`✓ ${r.file}:${r.line}${r.how === "matched" ? " (found by text)" : ""}`, "ok");
    } else {
      el.textContent = oldText;
      this.say(`✗ ${r.message}`, "err", 8000);
    }
  }

  async undo() {
    this.cancelEdit();
    await this.send({ type: "undo" });
  }
}

if (!(window as any).__crayon) {
  (window as any).__crayon = new Overlay();
}
