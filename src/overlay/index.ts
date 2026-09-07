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
.style {
  position: fixed; z-index: 2147483646; display: none; align-items: center; gap: 4px;
  height: 34px; padding: 0 6px; background: #16161a; color: #f4f4f5; border-radius: 999px;
  font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.25); white-space: nowrap;
}
.style.open { display: flex; }
.style select {
  all: unset; height: 24px; padding: 0 8px; border-radius: 999px; background: #26262c; color: #f4f4f5;
  font: 12px -apple-system, BlinkMacSystemFont, "Inter", sans-serif; cursor: pointer; max-width: 110px;
  overflow: hidden; text-overflow: ellipsis;
}
.style select:hover { background: #303038; }
.style .tog { width: 26px; padding: 0; justify-content: center; font-weight: 700; }
.style .tog.on { background: #f4f4f5; color: #16161a; }
.style .tog.i { font-style: italic; font-family: Georgia, serif; }
.style .swatch { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.35); display: inline-block; }
.style .muted { color: #a1a1aa; font-weight: 400; padding: 0 8px; }
.style .sep { width: 1px; height: 16px; background: rgba(255,255,255,.14); margin: 0 2px; }
.style button.danger:hover { background: rgba(239,68,68,.18); color: #fca5a5; }
button.offer { background: #312e81; color: #c7d2fe; }
button.offer:hover { background: #3730a3; }
.swatches {
  position: fixed; z-index: 2147483646; display: none; width: 300px; max-height: 300px; overflow: auto; padding: 10px;
  background: #16161a; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.35);
  font: 11px -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: #a1a1aa;
}
.swatches.open { display: block; }
.swatches h4 { margin: 8px 0 6px; font: 600 10.5px -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: #71717a; text-transform: uppercase; letter-spacing: .06em; }
.swatches h4:first-child { margin-top: 0; }
.swatches .grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; }
.swatches .named { display: flex; flex-wrap: wrap; gap: 6px; }
.swatches button.c { all: unset; cursor: pointer; width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid rgba(255,255,255,.12); box-sizing: border-box; }
.swatches button.c:hover, .swatches button.c.on { border-color: #fff; outline: 2px solid rgba(255,255,255,.35); }
.swatches button.n { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px 0 4px; border-radius: 999px; background: #26262c; color: #e4e4e7; }
.swatches button.n:hover, .swatches button.n.on { background: #3f3f46; }
.swatches button.n i { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.3); }
.panel {
  position: fixed; z-index: 2147483646; width: 340px; padding: 12px;
  background: #16161a; color: #f4f4f5; border-radius: 12px;
  font: 400 12.5px/1.4 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 12px 32px rgba(0,0,0,.3);
  display: none; flex-direction: column; gap: 10px;
}
.panel.open { display: flex; }
.panel .head { display: flex; align-items: center; gap: 10px; }
.panel .thumb { width: 44px; height: 44px; border-radius: 6px; object-fit: contain; background: repeating-conic-gradient(#2a2a30 0 25%, #1c1c21 0 50%) 0 0 / 12px 12px; flex-shrink: 0; }
.panel .meta { min-width: 0; }
.panel .meta b { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel .meta span { color: #a1a1aa; font-size: 11.5px; }
.panel .drop {
  border: 1.5px dashed rgba(255,255,255,.22); border-radius: 8px; padding: 14px 10px; text-align: center;
  color: #d4d4d8; cursor: pointer; transition: border-color .15s, background .15s;
}
.panel .drop:hover, .panel .drop.over { border-color: #a5b4fc; background: rgba(99,102,241,.12); }
.panel .drop.chosen { border-style: solid; border-color: #22c55e; color: #bbf7d0; }
.panel label { display: flex; flex-direction: column; gap: 4px; color: #a1a1aa; font-size: 11.5px; }
.panel input[type=text], .panel input[type=url] {
  all: unset; box-sizing: border-box; width: 100%; height: 28px; padding: 0 8px; border-radius: 6px;
  background: #26262c; color: #f4f4f5; font: 12.5px -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
}
.panel input:focus { outline: 1.5px solid #6366f1; }
.panel .row { display: flex; gap: 8px; }
.panel .row > * { flex: 1; }
.panel .actions { display: flex; justify-content: flex-end; gap: 6px; }
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
  publishBtn = document.createElement("button");
  git: { repo: boolean; branch?: string; upstream?: string } | null = null;
  pendingCount = 0;

  panel = document.createElement("div");
  styleBar = document.createElement("div");
  swatches = document.createElement("div");
  theme: {
    tailwind: 3 | 4 | null;
    projectColors: Record<string, string>;
    paletteColors: Record<string, string>;
    fonts: Record<string, string>;
  } | null = null;
  /** Class changes staged while editing; written on commit. */
  staged = { remove: new Set<string>(), add: new Set<string>() };
  stagedStyle: Record<string, string> = {};
  panelImg: HTMLImageElement | null = null;
  panelFile: { name: string; data: string } | null = null;
  ws: WebSocket | null = null;
  enabled = true;
  hovered: Element | null = null;
  editing: HTMLElement | null = null;
  editingOld = "";
  editingLocator: Locator = null;
  editingAncestors: string[] = [];
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
    this.publishBtn.textContent = "Publish";
    this.publishBtn.hidden = true;
    this.publishBtn.addEventListener("click", () => this.publish());
    this.bar.append(brand, sep, this.status, this.undoBtn, this.publishBtn, this.toggleBtn);

    this.box.className = "box";
    this.tag.className = "tag";
    this.box.append(this.tag);
    this.panel.className = "panel";
    this.styleBar.className = "style";
    this.swatches.className = "swatches";
    this.root.append(this.bar, this.box, this.panel, this.styleBar, this.swatches);
    fetch("/__crayon/theme")
      .then((r) => r.json())
      .then((t) => (this.theme = t))
      .catch(() => {});
    document.documentElement.append(this.host);
    document.addEventListener("dragover", this.onDragOver, true);
    document.addEventListener("drop", this.onDrop, true);

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
        if (msg.git) this.git = msg.git;
        if (typeof msg.pending === "number") this.setPending(msg.pending);
        if ((msg.type === "result" || msg.type === "published") && this.pending.has(msg.id)) {
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
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
        return resolve({ ok: false, message: "Crayon is not connected. Is the CLI still running?" });
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

  setPending(n: number) {
    this.pendingCount = n;
    const show = !!this.git?.repo && n > 0;
    this.publishBtn.hidden = !show;
    this.publishBtn.textContent = n > 0 ? `Publish (${n})` : "Publish";
    this.publishBtn.title = this.git?.upstream
      ? `Commit and push to ${this.git.upstream}`
      : `Commit on ${this.git?.branch ?? "this branch"} (no remote branch)`;
  }

  async publish() {
    if (!this.pendingCount) return;
    const what = this.git?.upstream
      ? `Commit and push ${this.pendingCount} change${this.pendingCount > 1 ? "s" : ""} to ${this.git.upstream}?`
      : `Commit ${this.pendingCount} change${this.pendingCount > 1 ? "s" : ""} on ${this.git?.branch}? (no remote branch to push to)`;
    if (this.publishBtn.dataset.confirm !== "1") {
      this.publishBtn.dataset.confirm = "1";
      this.publishBtn.textContent = "Confirm";
      this.say(what);
      window.setTimeout(() => {
        if (this.publishBtn.dataset.confirm === "1") {
          delete this.publishBtn.dataset.confirm;
          this.setPending(this.pendingCount);
          this.say(this.enabled ? "Click any text to edit" : "Browsing mode");
        }
      }, 6000);
      return;
    }
    delete this.publishBtn.dataset.confirm;
    this.publishBtn.disabled = true;
    this.publishBtn.textContent = "Publishing…";
    this.say("Publishing…");
    const r = await this.send({ type: "publish" });
    this.publishBtn.disabled = false;
    this.setPending(typeof r.pending === "number" ? r.pending : this.pendingCount);
    this.say(r.ok ? `⇡ ${r.message}` : `✗ ${r.message}`, r.ok ? "ok" : "err", 8000);
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

  /** data-crayon values up the tree, nearest first, without repeats. */
  ancestorsOf(el: Element): string[] {
    const out: string[] = [];
    let node: Element | null = el.parentElement;
    while (node) {
      const v = node.getAttribute(ATTR);
      if (v && !out.includes(v)) out.push(v);
      node = node.parentElement;
    }
    return out;
  }

  static INLINE = new Set([
    "B",
    "STRONG",
    "EM",
    "I",
    "U",
    "S",
    "BR",
    "SPAN",
    "A",
    "CODE",
    "MARK",
    "SMALL",
    "SUP",
    "SUB",
    "KBD",
    "ABBR",
    "TIME",
  ]);

  /** Text mixed with inline elements (bold, links, line breaks) whose children are plain text. */
  isComposite(el: Element): boolean {
    if (!(el instanceof HTMLElement) || el.childElementCount === 0) return false;
    if (/^(A|BUTTON|UL|OL|TABLE|SECTION|NAV|HEADER|FOOTER|FORM|IMG|SVG)$/.test(el.tagName)) return false;
    for (const c of el.children) {
      if (!Overlay.INLINE.has(c.tagName)) return false;
      if (c.tagName !== "BR" && c.childElementCount > 0) return false;
    }
    return (el.textContent ?? "").trim().length > 0;
  }

  /** Serialise an edited composite element into parts the writer can map back to the source. */
  partsOf(el: HTMLElement): any[] {
    const parts: any[] = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent ?? "";
        if (t) parts.push({ text: t });
      } else if (node instanceof Element) {
        parts.push({
          tag: node.tagName.toLowerCase(),
          locator: node.getAttribute(ATTR) ?? undefined,
          text: node.textContent ?? "",
          void: node.tagName === "BR",
        });
      }
    }
    return parts;
  }

  editingComposite = false;
  editingOldHtml = "";
  editingCompositeSnapshot: { parts: any[]; childLocator?: string; html: string } | null = null;

  /** Text-only elements are editable in place. */
  isTextOnly(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    if (["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "SELECT", "IMG", "SVG", "VIDEO", "CANVAS"].includes(el.tagName))
      return false;
    if (el.childElementCount > 0) return false;
    return (el.textContent ?? "").trim().length > 0;
  }

  /** From a click target, pick the element to edit: itself if text-only, otherwise the deepest text-only element under the pointer. */
  pickEditable(target: Element, x: number, y: number): HTMLElement | null {
    if (this.isTextOnly(target)) return target as HTMLElement;
    // A word inside a bold or a link of a mixed paragraph: edit the whole paragraph.
    if (target.parentElement && Overlay.INLINE.has(target.tagName) && this.isComposite(target.parentElement))
      return target.parentElement as HTMLElement;
    if (this.isComposite(target)) return target as HTMLElement;
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
    const el = this.isTextOnly(target)
      ? target
      : this.isComposite(target)
        ? target
        : (target.closest(`[${ATTR}]`) ?? null);
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
    if (this.editing && this.styleBar.classList.contains("open")) this.placeStyleBar(this.editing);
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
    if (this.panel.classList.contains("open")) {
      this.closePanel();
      return;
    }
    const target = e.target as Element;
    const img =
      target instanceof HTMLImageElement ? target : (target.querySelector?.("img") as HTMLImageElement | null);
    if (img && (target === img || (target.childElementCount === 1 && target.firstElementChild === img))) {
      this.openImagePanel(img);
      return;
    }
    if (target.tagName === "svg" || target.closest("svg")) {
      this.say("Inline SVG icons are code, not images. Change them in your editor.", "err");
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
    if (e.key === "Escape" && this.panel.classList.contains("open")) {
      e.preventDefault();
      this.closePanel();
      return;
    }
    if (!this.editing) return;
    if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "i")) {
      e.preventDefault();
      const done = this.formatSelection(this.editing, e.key.toLowerCase() === "b" ? "strong" : "em");
      if (!done) this.say("Select some text first to make it bold or italic", "", 3000);
      return;
    }
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
    this.editingComposite = this.isComposite(el);
    this.editingOldHtml = el.innerHTML;
    this.editingLocator = this.locatorOf(el);
    this.editingAncestors = this.ancestorsOf(el);
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
    this.openStyleBar(el);
  }

  redrawSoon = () => requestAnimationFrame(() => this.redraw());

  onBlur = () => {
    // Focus moving into the style bar must not commit; a click elsewhere commits through onClick.
    window.setTimeout(() => {
      if (!this.editing) return;
      const active = this.root.activeElement;
      if (active && this.host.contains(this.host) && this.styleBar.contains(active)) {
        return;
      }
      if (this.swatches.classList.contains("open")) return;
      this.commitEdit();
    }, 0);
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
    for (const k of Object.keys(this.stagedStyle)) el.style.removeProperty(k);
    this.stagedStyle = {};
    this.styleBar.classList.remove("open");
    this.swatches.classList.remove("open");
    this.editing = null;
    this.redraw();
  }

  cancelEdit() {
    const el = this.editing;
    if (!el) return;
    if (this.editingComposite || el.childElementCount > 0) el.innerHTML = this.editingOldHtml;
    else el.textContent = this.editingOld;
    for (const t of this.staged.add) el.classList.remove(t);
    for (const t of this.staged.remove) el.classList.add(t);
    this.staged = { remove: new Set(), add: new Set() };
    this.finishEdit();
    this.say("Cancelled");
  }

  async commitEdit() {
    const el = this.editing;
    if (!el) return;
    const newText = (el.textContent ?? "").replace(/ /g, " ");
    const oldText = this.editingOld;
    const locator = this.editingLocator;
    const ancestors = this.editingAncestors;
    const ownLocator = this.locatorOf(el);
    const isOwn = el.hasAttribute(ATTR);
    const staged = this.staged;
    this.staged = { remove: new Set(), add: new Set() };
    const markupChanged = (this.editingComposite || el.childElementCount > 0) && el.innerHTML !== this.editingOldHtml;
    if (this.editingComposite || el.childElementCount > 0) {
      this.editingCompositeSnapshot = {
        parts: this.partsOf(el),
        childLocator: [...el.children].map((c) => c.getAttribute(ATTR)).find(Boolean) ?? undefined,
        html: this.editingOldHtml,
      };
    } else {
      this.editingCompositeSnapshot = null;
    }
    this.finishEdit();
    const collapse = (t: string) => t.replace(/[\s\u00a0]+/g, " ").trim();
    const textChanged = collapse(newText) !== collapse(oldText) || markupChanged;
    const classChanged = staged.add.size > 0 || staged.remove.size > 0;
    if (!textChanged && !classChanged) {
      this.say("No change");
      return;
    }
    if (textChanged && newText.trim() === "") {
      el.textContent = oldText;
      this.say("Empty text is not saved. Delete the element in code if you need to.", "err");
      return;
    }
    this.say("Saving…");
    const notes: string[] = [];
    if (textChanged && this.editingCompositeSnapshot) {
      const snap = this.editingCompositeSnapshot;
      this.editingCompositeSnapshot = null;
      const r = await this.send({
        type: "composite",
        ...(isOwn ? ownLocator : {}),
        childLocator: snap.childLocator,
        parts: snap.parts,
        oldText,
      });
      if (r.ok) notes.push(`✓ ${r.file}:${r.line}`);
      else {
        el.innerHTML = snap.html;
        notes.push(`✗ ${r.message}`);
      }
    } else if (textChanged) {
      const r = await this.send({ type: "edit", ...(locator ?? {}), ancestors, oldText, newText });
      if (r.ok) {
        notes.push(
          `✓ ${r.file}:${r.line}${r.how === "matched" ? " (found by text)" : r.how === "data" ? " (content file)" : ""}`,
        );
        if (typeof r.others === "number" && r.others > 0) this.offerReplaceAll(oldText, newText, r.others);
      } else {
        el.textContent = oldText;
        notes.push(`✗ ${r.message}`);
      }
    }
    if (classChanged) {
      const r = await this.send({
        type: "class",
        ...(isOwn ? ownLocator : {}),
        remove: [...staged.remove],
        add: [...staged.add],
      });
      if (r.ok)
        notes.push(`✓ styles ${r.file}:${r.line}${r.missing?.length ? " · not found: " + r.missing.join(" ") : ""}`);
      else {
        for (const t of staged.add) el.classList.remove(t);
        for (const t of staged.remove) el.classList.add(t);
        notes.push(`✗ ${r.message}`);
      }
    }
    const failed = notes.some((n) => n.startsWith("✗"));
    this.say(notes.join("  "), failed ? "err" : "ok", failed ? 9000 : 4000);
  }

  /* ---------- style bar ---------- */
  static SIZES = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"];
  static SIZE_CSS: Record<string, string> = {
    xs: ".75rem",
    sm: ".875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
    "6xl": "3.75rem",
  };
  static WEIGHTS = ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"];
  static WEIGHT_CSS: Record<string, string> = {
    thin: "100",
    extralight: "200",
    light: "300",
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    extrabold: "800",
    black: "900",
  };
  static SIZE_RE = /^text-(xs|sm|base|lg|xl|\d+xl)$/;
  static PADS = ["0", "1", "2", "3", "4", "5", "6", "8", "10", "12"];
  static PAD_RE = /^p-(0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|7|8|9|10|11|12|14|16|20|24)$/;
  static RADII = ["none", "sm", "md", "lg", "xl", "2xl", "3xl", "full"];
  static RADIUS_RE = /^rounded(-(none|sm|md|lg|xl|2xl|3xl|full))?$/;
  static RADIUS_CSS: Record<string, string> = {
    none: "0",
    sm: ".125rem",
    md: ".375rem",
    lg: ".5rem",
    xl: ".75rem",
    "2xl": "1rem",
    "3xl": "1.5rem",
    full: "9999px",
  };
  static WEIGHT_RE = /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/;

  colorValue(name: string): string {
    const t = this.theme!;
    const raw = t.projectColors[name] ?? t.paletteColors[name] ?? "";
    const root = getComputedStyle(document.documentElement);
    const fromVar = root.getPropertyValue(`--color-${name}`).trim();
    if (fromVar && !fromVar.startsWith("var(")) return fromVar;
    const m = /^var\((--[\w-]+)\)$/.exec(raw);
    if (m) {
      const v = root.getPropertyValue(m[1]).trim();
      if (v) return v;
    }
    return raw;
  }

  fontValue(name: string): string {
    const raw = this.theme!.fonts[name] ?? "";
    const root = getComputedStyle(document.documentElement);
    const fromVar = root.getPropertyValue(`--font-${name}`).trim();
    if (fromVar && !fromVar.startsWith("var(")) return fromVar;
    const m = /^var\((--[\w-]+)\)$/.exec(raw);
    if (m) return root.getPropertyValue(m[1]).trim() || raw;
    return raw;
  }

  /** Stage a token swap: remove tokens matching `pattern`, add `token`, preview with an inline style. */
  swap(el: HTMLElement, pattern: RegExp, token: string | null, cssProp?: string, cssValue?: string) {
    for (const cls of [...el.classList]) {
      if (pattern.test(cls) && cls !== token) {
        el.classList.remove(cls);
        if (this.staged.add.has(cls)) this.staged.add.delete(cls);
        else this.staged.remove.add(cls);
      }
    }
    if (token && !el.classList.contains(token)) {
      el.classList.add(token);
      if (this.staged.remove.has(token)) this.staged.remove.delete(token);
      else this.staged.add.add(token);
    }
    if (cssProp) {
      if (cssValue) {
        el.style.setProperty(cssProp, cssValue);
        this.stagedStyle[cssProp] = cssValue;
      } else {
        el.style.removeProperty(cssProp);
        delete this.stagedStyle[cssProp];
      }
    }
    this.redraw();
  }

  colorNames(): string[] {
    const t = this.theme!;
    return [...Object.keys(t.projectColors), ...Object.keys(t.paletteColors)];
  }

  colorRe(prefix = "text"): RegExp {
    return new RegExp(
      `^${prefix}-(` +
        this.colorNames()
          .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("|") +
        ")(/\\d+)?$",
    );
  }

  /** A non-collapsed selection inside the element being edited, if any. */
  selectionIn(el: HTMLElement): Range | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return null;
    if (range.toString().trim() === "") return null;
    return range;
  }

  /** Wrap the selection in <strong>/<em>, or unwrap it when it is already entirely inside one. */
  formatSelection(el: HTMLElement, tag: "strong" | "em"): boolean {
    const range = this.selectionIn(el);
    if (!range) return false;
    const alt = tag === "strong" ? "b" : "i";
    const node = range.commonAncestorContainer;
    const host = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest(
      `${tag}, ${alt}`,
    ) as HTMLElement | null;
    if (host && el.contains(host) && host !== el) {
      // unwrap the whole formatted run
      const parent = host.parentNode!;
      while (host.firstChild) parent.insertBefore(host.firstChild, host);
      parent.removeChild(host);
      el.normalize();
    } else {
      const wrapper = document.createElement(tag);
      try {
        range.surroundContents(wrapper);
      } catch {
        // selection crosses element boundaries: extract then wrap
        wrapper.append(range.extractContents());
        range.insertNode(wrapper);
      }
      // drop empty formatting shells the extraction may leave behind
      for (const e of el.querySelectorAll("strong:empty, em:empty, b:empty, i:empty")) e.remove();
      el.normalize();
      const sel = window.getSelection();
      sel?.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(wrapper);
      sel?.addRange(r);
    }
    this.redraw();
    return true;
  }

  openStyleBar(el: HTMLElement) {
    const t = this.theme;
    if (!t || !t.tailwind) return;
    const bar = this.styleBar;
    bar.innerHTML = "";
    if (!el.hasAttribute(ATTR)) {
      const note = document.createElement("span");
      note.className = "muted";
      note.textContent = "Styles live in the component that renders this text";
      bar.append(note);
      bar.classList.add("open");
      this.placeStyleBar(el);
      return;
    }
    const classes = [...el.classList];
    const colorNames = new Set(this.colorNames());
    const fontNames = Object.keys(t.fonts);
    const cur = {
      size: classes.find((c) => Overlay.SIZE_RE.test(c))?.slice(5) ?? "",
      weight: classes.find((c) => Overlay.WEIGHT_RE.test(c))?.slice(5) ?? "",
      italic: classes.includes("italic"),
      color: classes.find((c) => c.startsWith("text-") && colorNames.has(c.slice(5).split("/")[0]))?.slice(5) ?? "",
      bg: classes.find((c) => c.startsWith("bg-") && colorNames.has(c.slice(3).split("/")[0]))?.slice(3) ?? "",
      font: classes.find((c) => c.startsWith("font-") && fontNames.includes(c.slice(5)))?.slice(5) ?? "",
      pad: classes.find((c) => Overlay.PAD_RE.test(c))?.slice(2) ?? "",
      radius: (() => {
        const c = classes.find((c) => Overlay.RADIUS_RE.test(c));
        return c ? (c === "rounded" ? "md" : c.slice(8)) : "";
      })(),
    };
    const select = (
      label: string,
      options: string[],
      value: string,
      onChange: (v: string) => void,
      render?: (o: HTMLOptionElement, v: string) => void,
    ) => {
      const sel = document.createElement("select");
      sel.title = label;
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = label;
      sel.append(empty);
      for (const o of options) {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        render?.(opt, o);
        sel.append(opt);
      }
      sel.value = value;
      sel.addEventListener("change", () => onChange(sel.value));
      return sel;
    };
    bar.append(
      select("Size", Overlay.SIZES, cur.size, (v) =>
        this.swap(el, Overlay.SIZE_RE, v ? `text-${v}` : null, "font-size", v ? Overlay.SIZE_CSS[v] : ""),
      ),
      select("Weight", Overlay.WEIGHTS, cur.weight, (v) =>
        this.swap(el, Overlay.WEIGHT_RE, v ? `font-${v}` : null, "font-weight", v ? Overlay.WEIGHT_CSS[v] : ""),
      ),
    );
    const bold = document.createElement("button");
    bold.className = "tog";
    bold.textContent = "B";
    bold.title = "Bold the selected words (⌘B). Without a selection, use Weight.";
    bold.addEventListener("click", () => {
      if (!this.formatSelection(el, "strong"))
        this.say("Select some words first, or change the weight of the whole text", "", 3000);
    });
    const italic = document.createElement("button");
    italic.className = "tog i" + (cur.italic ? " on" : "");
    italic.textContent = "I";
    italic.title = "Italic: the selected words (⌘I), or the whole text";
    italic.addEventListener("click", () => {
      if (this.formatSelection(el, "em")) return;
      const on = !italic.classList.contains("on");
      italic.classList.toggle("on", on);
      this.swap(el, /^(italic|not-italic)$/, on ? "italic" : null, "font-style", on ? "italic" : "");
    });
    const color = document.createElement("button");
    const dot = document.createElement("span");
    dot.className = "swatch";
    dot.style.background = getComputedStyle(el).color;
    color.append(dot, document.createTextNode(cur.color || "Color"));
    color.title = "Text colour";
    color.addEventListener("click", () =>
      this.toggleSwatches(el, cur.color, (name) => {
        color.replaceChildren(dot, document.createTextNode(name));
        dot.style.background = this.colorValue(name);
      }),
    );
    const bg = document.createElement("button");
    const bgDot = document.createElement("span");
    bgDot.className = "swatch";
    bgDot.style.background = getComputedStyle(el).backgroundColor;
    bg.append(bgDot, document.createTextNode(cur.bg || "Background"));
    bg.title = "Background colour";
    bg.addEventListener("click", () =>
      this.toggleSwatches(
        el,
        cur.bg,
        (name) => {
          bg.replaceChildren(bgDot, document.createTextNode(name));
          bgDot.style.background = this.colorValue(name);
        },
        "bg",
      ),
    );
    bar.append(bold, italic, color, bg);
    if (fontNames.length > 1) {
      bar.append(
        select(
          "Font",
          fontNames,
          cur.font,
          (v) =>
            this.swap(
              el,
              new RegExp(`^font-(${fontNames.join("|")})$`),
              v ? `font-${v}` : null,
              "font-family",
              v ? this.fontValue(v) : "",
            ),
          (opt, v) => (opt.style.fontFamily = this.fontValue(v)),
        ),
      );
    }
    // Spacing and radius matter on buttons, links and badges; plain paragraphs rarely need them.
    if (/^(A|BUTTON|SPAN|LI|DIV|LABEL)$/.test(el.tagName) || cur.pad || cur.radius) {
      bar.append(
        select("Padding", Overlay.PADS, cur.pad, (v) =>
          this.swap(el, Overlay.PAD_RE, v ? `p-${v}` : null, "padding", v ? `calc(var(--spacing, .25rem) * ${v})` : ""),
        ),
        select("Radius", Overlay.RADII, cur.radius, (v) =>
          this.swap(
            el,
            Overlay.RADIUS_RE,
            v ? (v === "md" ? "rounded-md" : `rounded-${v}`) : null,
            "border-radius",
            v ? Overlay.RADIUS_CSS[v] : "",
          ),
        ),
      );
    }
    const sep = document.createElement("span");
    sep.className = "sep";
    const dup = document.createElement("button");
    dup.textContent = "Duplicate";
    dup.title = `Insert a copy of this <${el.tagName.toLowerCase()}> right after it`;
    dup.addEventListener("click", () => this.elementOp(el, "duplicate"));
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete";
    del.title = `Remove this <${el.tagName.toLowerCase()}> from the code (Undo brings it back)`;
    del.addEventListener("click", () => this.elementOp(el, "delete"));
    bar.append(sep, dup, del);
    for (const b of bar.querySelectorAll("button")) b.addEventListener("mousedown", (e) => e.preventDefault());
    bar.classList.add("open");
    this.placeStyleBar(el);
  }

  async elementOp(el: HTMLElement, kind: "duplicate" | "delete") {
    const loc = this.locatorOf(el);
    if (!el.hasAttribute(ATTR) || !loc) {
      this.say("This element is rendered by a component. Change it in that component's file.", "err");
      return;
    }
    this.cancelEdit();
    this.say(kind === "duplicate" ? "Duplicating…" : "Deleting…");
    const r = await this.send({ type: "element", kind, ...loc });
    if (!r.ok) {
      this.say(`✗ ${r.message}`, "err", 8000);
      return;
    }
    if (kind === "delete") el.remove();
    else el.after(el.cloneNode(true));
    this.hover(null);
    this.say(`✓ ${kind === "duplicate" ? "Duplicated" : "Deleted"} · ${r.file}:${r.line}`, "ok");
  }

  /** After a text edit, offer to change the same text everywhere else. */
  offerReplaceAll(oldText: string, newText: string, others: number) {
    const btn = document.createElement("button");
    btn.className = "offer";
    btn.textContent = `Also replace in ${others} other place${others > 1 ? "s" : ""}`;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const r = await this.send({ type: "replace-all", oldText, newText });
      btn.remove();
      if (r.ok)
        this.say(`✓ Replaced ${r.count} occurrence${r.count > 1 ? "s" : ""} in ${r.files.join(", ")}`, "ok", 8000);
      else this.say(`✗ ${r.message}`, "err", 8000);
    });
    this.bar.insertBefore(btn, this.undoBtn);
    window.setTimeout(() => btn.remove(), 15000);
  }

  placeStyleBar(el: Element) {
    const r = el.getBoundingClientRect();
    const bar = this.styleBar;
    const below = r.bottom + 8 + 34 < window.innerHeight;
    bar.style.top = `${below ? r.bottom + 8 : Math.max(60, r.top - 42)}px`;
    bar.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - bar.offsetWidth - 8)}px`;
  }

  toggleSwatches(el: HTMLElement, current: string, onPick: (name: string) => void, prefix: "text" | "bg" = "text") {
    const sw = this.swatches;
    if (sw.classList.contains("open")) {
      sw.classList.remove("open");
      return;
    }
    const t = this.theme!;
    sw.innerHTML = "";
    const pick = (name: string) => {
      this.swap(
        el,
        this.colorRe(prefix),
        `${prefix}-${name}`,
        prefix === "bg" ? "background-color" : "color",
        this.colorValue(name),
      );
      onPick(name);
      sw.classList.remove("open");
    };
    const projectNames = Object.keys(t.projectColors).filter(
      (n) =>
        (!/^(background|border|input|ring|card|popover|sidebar|chart)/.test(n) && !n.endsWith("-foreground")) ||
        /^(foreground|muted-foreground|accent-foreground)$/.test(n),
    );
    if (projectNames.length) {
      const h = document.createElement("h4");
      h.textContent = "Your theme";
      const named = document.createElement("div");
      named.className = "named";
      for (const name of projectNames) {
        const b = document.createElement("button");
        b.className = "n" + (name === current ? " on" : "");
        const i = document.createElement("i");
        i.style.background = this.colorValue(name);
        b.append(i, document.createTextNode(name));
        b.addEventListener("click", () => pick(name));
        named.append(b);
      }
      sw.append(h, named);
    }
    const hues = new Map<string, string[]>();
    for (const name of Object.keys(t.paletteColors)) {
      const m = /^([a-z]+)-(\d+)$/.exec(name);
      if (!m) continue;
      if (!hues.has(m[1])) hues.set(m[1], []);
      hues.get(m[1])!.push(name);
    }
    if (hues.size) {
      const h = document.createElement("h4");
      h.textContent = "Palette";
      sw.append(h);
      for (const [, names] of hues) {
        const row = document.createElement("div");
        row.className = "grid";
        for (const name of names.filter((n) => /-(100|200|300|400|500|600|700|800|900|950)$/.test(n))) {
          const b = document.createElement("button");
          b.className = "c" + (name === current ? " on" : "");
          b.title = name;
          b.style.background = this.colorValue(name);
          b.addEventListener("click", () => pick(name));
          row.append(b);
        }
        sw.append(row);
      }
    }
    for (const b of sw.querySelectorAll("button")) b.addEventListener("mousedown", (e) => e.preventDefault());
    const r = this.styleBar.getBoundingClientRect();
    sw.style.top = `${r.bottom + 6}px`;
    sw.style.left = `${Math.min(r.left, window.innerWidth - 316)}px`;
    sw.classList.add("open");
  }

  /* ---------- images ---------- */
  openImagePanel(img: HTMLImageElement) {
    this.panelImg = img;
    this.panelFile = null;
    this.hovered = img;
    this.redraw();
    const src = img.getAttribute("src") ?? "";
    const alt = img.getAttribute("alt") ?? "";
    const shown =
      decodeURIComponent(/[?&]url=([^&]+)/.exec(src)?.[1] ?? src)
        .split("/")
        .pop()
        ?.split("?")[0] ?? src;
    const dims = img.naturalWidth ? `${img.naturalWidth} × ${img.naturalHeight}` : "";
    this.panel.innerHTML = `
      <div class="head">
        <img class="thumb" src="${img.currentSrc || src}" alt="">
        <div class="meta"><b title="${src.replace(/"/g, "&quot;")}">${shown}</b><span>${dims}</span></div>
      </div>
      <div class="drop">Drop an image here, or click to choose a file</div>
      <div class="row"><input type="url" placeholder="…or paste an image URL"></div>
      <label>Alt text<input type="text" value="${alt.replace(/"/g, "&quot;")}"></label>
      <div class="actions"><button class="cancel">Cancel</button><button class="primary save">Save</button></div>`;
    const drop = this.panel.querySelector(".drop") as HTMLElement;
    const url = this.panel.querySelector("input[type=url]") as HTMLInputElement;
    const altInput = this.panel.querySelector("input[type=text]") as HTMLInputElement;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.addEventListener("change", () => picker.files?.[0] && this.pickFile(picker.files[0], drop));
    drop.addEventListener("click", () => picker.click());
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      const f = e.dataTransfer?.files?.[0];
      if (f) this.pickFile(f, drop);
    });
    this.panel.querySelector(".cancel")!.addEventListener("click", () => this.closePanel());
    this.panel
      .querySelector(".save")!
      .addEventListener("click", () => this.saveImage(url.value.trim(), altInput.value, alt));
    altInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.saveImage(url.value.trim(), altInput.value, alt);
    });
    this.panel.classList.add("open");
    const r = img.getBoundingClientRect();
    const top = r.bottom + 8 + 260 < window.innerHeight ? r.bottom + 8 : Math.max(12, r.top - 8 - 260);
    this.panel.style.top = `${top}px`;
    this.panel.style.left = `${Math.min(Math.max(12, r.left), window.innerWidth - 352)}px`;
  }

  pickFile(file: File, drop: HTMLElement) {
    if (!file.type.startsWith("image/")) {
      this.say("That is not an image file.", "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result).split(",")[1] ?? "";
      this.panelFile = { name: file.name, data };
      drop.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
      drop.classList.add("chosen");
    };
    reader.readAsDataURL(file);
  }

  closePanel() {
    this.panel.classList.remove("open");
    this.panel.innerHTML = "";
    this.panelImg = null;
    this.panelFile = null;
    this.hovered = null;
    this.redraw();
  }

  async saveImage(url: string, alt: string, currentAlt: string) {
    const img = this.panelImg;
    if (!img) return;
    const file = this.panelFile;
    const altChanged = alt !== currentAlt;
    if (!file && !url && !altChanged) {
      this.closePanel();
      this.say("No change");
      return;
    }
    const msg: any = {
      type: "image",
      ...(this.locatorOf(img) ?? {}),
      ancestors: this.ancestorsOf(img),
      src: img.getAttribute("src") ?? "",
      currentAlt,
      alt: altChanged ? alt : undefined,
    };
    if (file) Object.assign(msg, { name: file.name, data: file.data });
    else if (url) msg.url = url;
    this.closePanel();
    this.say("Saving image…");
    const r = await this.send(msg);
    if (r.ok) {
      if (altChanged) img.alt = alt;
      this.say(`✓ ${r.file}${r.line ? ":" + r.line : ""}${r.note ? " · " + r.note : ""}`, "ok", r.note ? 8000 : 4000);
      if (r.reload) window.setTimeout(() => location.reload(), 600);
    } else {
      this.say(`✗ ${r.message}`, "err", 8000);
    }
  }

  onDragOver = (e: DragEvent) => {
    if (!this.enabled || this.isOurs(e.target)) return;
    if (e.target instanceof HTMLImageElement && e.dataTransfer?.types.includes("Files")) {
      e.preventDefault();
      this.hover(e.target);
    }
  };

  onDrop = (e: DragEvent) => {
    if (!this.enabled || this.isOurs(e.target)) return;
    const img = e.target instanceof HTMLImageElement ? e.target : null;
    const f = e.dataTransfer?.files?.[0];
    if (!img || !f) return;
    e.preventDefault();
    e.stopPropagation();
    const reader = new FileReader();
    reader.onload = async () => {
      const data = String(reader.result).split(",")[1] ?? "";
      this.say("Saving image…");
      const r = await this.send({
        type: "image",
        ...(this.locatorOf(img) ?? {}),
        ancestors: this.ancestorsOf(img),
        src: img.getAttribute("src") ?? "",
        name: f.name,
        data,
      });
      if (r.ok) {
        this.say(`✓ ${r.file}${r.line ? ":" + r.line : ""}${r.note ? " · " + r.note : ""}`, "ok", r.note ? 8000 : 4000);
        if (r.reload) window.setTimeout(() => location.reload(), 600);
      } else this.say(`✗ ${r.message}`, "err", 8000);
    };
    reader.readAsDataURL(f);
  };

  async undo() {
    this.cancelEdit();
    await this.send({ type: "undo" });
  }
}

if (!(window as any).__crayon) {
  (window as any).__crayon = new Overlay();
}
