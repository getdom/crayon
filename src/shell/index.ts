/**
 * The Crayon shell: the chrome around the site.
 *
 * The site runs in an iframe on the same origin as the shell, so the shell can reach
 * into its document directly. The iframe is what makes responsive widths real: media
 * queries answer to the frame's viewport, which a wrapper element could never do.
 */

/** Marks a request as the shell's own frame, for browsers that do not send Sec-Fetch-Dest. */
export const FRAME_PARAM = "__crayon";
export const FRAME_VALUE = "frame";

export interface Device {
  id: string;
  label: string;
  /** Frame width in CSS pixels; 0 fills the stage. */
  width: number;
}

export const DEVICES: Device[] = [
  { id: "full", label: "Full", width: 0 },
  { id: "desktop", label: "Desktop", width: 1280 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "phone", label: "Phone", width: 390 },
];

/** True when this request is a top-level page navigation, so the shell answers instead of the site. */
export function wantsShell(url: string, headers: Record<string, string | string[] | undefined>): boolean {
  const path = url.split("?")[0];
  if (path.startsWith("/__crayon/")) return false;
  const query = url.slice(path.length);
  if (new URLSearchParams(query).get(FRAME_PARAM) === FRAME_VALUE) return false;
  const dest = headers["sec-fetch-dest"];
  if (typeof dest === "string" && dest.length) return dest === "document";
  // No Sec-Fetch-Dest: fall back to the Accept header. The frame carries the marker above.
  return String(headers.accept ?? "").includes("text/html");
}

/** The URL the shell points its frame at: the requested path, marked as the frame. */
export function frameUrl(url: string): string {
  const [path, query = ""] = [url.split("?")[0], url.split("?")[1]];
  const params = new URLSearchParams(query);
  params.set(FRAME_PARAM, FRAME_VALUE);
  return `${path}?${params.toString()}`;
}

const CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; display: flex; flex-direction: column; background: #0b0d12;
    font: 13px/1.4 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
    color: #e6e8ee;
  }
  .bar {
    flex: none; display: flex; align-items: center; gap: 14px; height: 44px; padding: 0 12px;
    background: #12151d; border-bottom: 1px solid #232838; user-select: none;
  }
  .mark { display: flex; align-items: center; gap: 7px; font-weight: 600; letter-spacing: .01em; }
  .mark b { font-weight: 600; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #4d7cff; }
  .devices { display: flex; gap: 2px; padding: 2px; background: #0b0d12; border: 1px solid #232838; border-radius: 8px; }
  .devices button {
    appearance: none; border: 0; background: transparent; color: #9aa3b8; cursor: pointer;
    font: inherit; padding: 4px 11px; border-radius: 6px; transition: background .12s, color .12s;
  }
  .devices button:hover { color: #e6e8ee; }
  .devices button[aria-pressed="true"] { background: #2a3350; color: #fff; }
  .readout { color: #6b7488; font-variant-numeric: tabular-nums; }
  .path { color: #6b7488; margin-left: auto; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stage { flex: 1; min-height: 0; display: flex; justify-content: center; overflow: hidden; padding: 0; }
  .stage.framed { padding: 20px; background: #0b0d12; }
  iframe {
    border: 0; background: #fff; display: block; width: 100%; height: 100%;
    transform-origin: top center;
  }
  .stage.framed iframe { border-radius: 10px; box-shadow: 0 18px 50px rgba(0,0,0,.55); }
`;

/** The shell document, pointing its frame at the requested path. */
export function shellHtml(url: string, title = "Crayon"): string {
  const devices = JSON.stringify(DEVICES);
  const src = frameUrl(url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<div class="bar">
  <span class="mark"><span class="dot"></span><b>Crayon</b></span>
  <div class="devices" id="devices"></div>
  <span class="readout" id="readout"></span>
  <span class="path" id="path"></span>
</div>
<div class="stage" id="stage"><iframe id="frame" src="${src}" title="Site"></iframe></div>
<script>
(function () {
  // A shell that ends up nested in its own frame steps aside for the site.
  if (window.top !== window.self) {
    var u = new URL(location.href);
    u.searchParams.set(${JSON.stringify(FRAME_PARAM)}, ${JSON.stringify(FRAME_VALUE)});
    location.replace(u.toString());
    return;
  }

  var DEVICES = ${devices};
  var KEY = "crayon.device";
  var stage = document.getElementById("stage");
  var frame = document.getElementById("frame");
  var readout = document.getElementById("readout");
  var pathEl = document.getElementById("path");
  var bar = document.getElementById("devices");
  var current = DEVICES[0];

  try {
    var saved = localStorage.getItem(KEY);
    if (saved) current = DEVICES.filter(function (d) { return d.id === saved; })[0] || DEVICES[0];
  } catch (e) {}

  DEVICES.forEach(function (d) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = d.label;
    b.setAttribute("data-id", d.id);
    b.addEventListener("click", function () { select(d); });
    bar.appendChild(b);
  });

  function select(d) {
    current = d;
    try { localStorage.setItem(KEY, d.id); } catch (e) {}
    Array.prototype.forEach.call(bar.children, function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-id") === d.id));
    });
    layout();
  }

  /** Size the frame to the device, scaling down only when the stage is too narrow to hold it. */
  function layout() {
    var d = current;
    if (!d.width) {
      stage.className = "stage";
      frame.style.width = "100%";
      frame.style.height = "100%";
      frame.style.transform = "none";
      readout.textContent = stage.clientWidth + " px";
      return;
    }
    stage.className = "stage framed";
    var pad = 40;
    var availW = stage.clientWidth - pad;
    var availH = stage.clientHeight - pad;
    var scale = Math.min(1, availW / d.width);
    frame.style.width = d.width + "px";
    frame.style.height = Math.floor(availH / scale) + "px";
    frame.style.transform = scale < 1 ? "scale(" + scale + ")" : "none";
    readout.textContent = d.width + " px" + (scale < 1 ? "  ·  " + Math.round(scale * 100) + "%" : "");
  }

  function showPath() {
    try { pathEl.textContent = frame.contentWindow.location.pathname; } catch (e) { pathEl.textContent = ""; }
  }

  frame.addEventListener("load", showPath);
  window.addEventListener("resize", layout);
  select(current);
  showPath();
})();
</script>
</body>
</html>`;
}
