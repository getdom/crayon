/**
 * The Crayon shell: the page around the site.
 *
 * The site runs in an iframe on the same origin as the shell, so the shell can reach
 * into its document directly. The iframe is what makes responsive widths real: media
 * queries answer to the frame's viewport, which a wrapper element could never do.
 *
 * The shell has no toolbar of its own. The overlay, running in the frame, mounts the
 * Crayon toolbar in the shell's document and drives the widths through `__crayonShell`.
 */

/** Marks a request as the shell's own frame, for browsers that do not send Sec-Fetch-Dest. */
export const FRAME_PARAM = "__crayon";
export const FRAME_VALUE = "frame";

/**
 * Height kept free above a device frame for the Crayon toolbar. At Full width the site
 * fills the window and the toolbar floats over it, as it does without the shell.
 */
export const TOOLBAR_SPACE = 58;

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

const SIDE = 20;

const CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: #0b0d12; }
  .stage { height: 100%; display: flex; justify-content: center; overflow: hidden; padding: 0; }
  .stage.framed { padding: ${TOOLBAR_SPACE}px ${SIDE}px ${SIDE}px; }
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
  var TOP = ${TOOLBAR_SPACE};
  var SIDE = ${SIDE};
  var stage = document.getElementById("stage");
  var frame = document.getElementById("frame");
  var current = DEVICES[0];
  var scale = 1;
  var listener = null;

  try {
    var saved = localStorage.getItem(KEY);
    if (saved) current = DEVICES.filter(function (d) { return d.id === saved; })[0] || DEVICES[0];
  } catch (e) {}

  function state() {
    return { id: current.id, width: current.width || stage.clientWidth, scale: scale };
  }

  function notify() {
    if (!listener) return;
    try { listener(state()); } catch (e) { listener = null; }
  }

  function select(id) {
    var d = DEVICES.filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    current = d;
    try { localStorage.setItem(KEY, d.id); } catch (e) {}
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
      scale = 1;
      notify();
      return;
    }
    stage.className = "stage framed";
    var availW = stage.clientWidth - 2 * SIDE;
    var availH = stage.clientHeight - TOP - SIDE;
    scale = Math.min(1, availW / d.width);
    frame.style.width = d.width + "px";
    frame.style.height = Math.floor(availH / scale) + "px";
    frame.style.transform = scale < 1 ? "scale(" + scale + ")" : "none";
    notify();
  }

  window.__crayonShell = {
    devices: DEVICES,
    state: state,
    select: select,
    // One listener at a time: each overlay that loads in the frame replaces the previous one.
    subscribe: function (fn) {
      listener = fn || null;
      notify();
    },
  };

  window.addEventListener("resize", layout);
  layout();
})();
</script>
</body>
</html>`;
}
