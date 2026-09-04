import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { listFiles } from "../writer/files.js";

export interface Theme {
  /** 3, 4, or null when Tailwind is not installed. */
  tailwind: 3 | 4 | null;
  /** Colours declared by the project (shadcn tokens, brand colours): name → CSS value. */
  projectColors: Record<string, string>;
  /** Tailwind's default palette: name → CSS value. */
  paletteColors: Record<string, string>;
  /** Font families available as `font-<name>` classes: name → CSS value. */
  fonts: Record<string, string>;
}

function readVars(css: string, prefix: string, out: Record<string, string>) {
  // --color-primary: var(--primary);  /  --font-sans: ui-sans-serif, ...;
  const re = new RegExp(`--${prefix}-([a-z0-9-]+)\\s*:\\s*([^;]+);`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const name = m[1];
    if (
      name === "*" ||
      name.startsWith("weight-") ||
      name.endsWith("--font-feature-settings") ||
      name.endsWith("-feature-settings") ||
      name.endsWith("-variation-settings")
    )
      continue;
    out[name] = m[2].replace(/\s+/g, " ").trim();
  }
}

/** Only the `@theme { … }` blocks of a CSS file. */
function themeBlocks(css: string): string {
  const out: string[] = [];
  const re = /@theme[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    out.push(css.slice(start, i - 1));
  }
  return out.join("\n");
}

export function readTheme(root: string): Theme {
  const theme: Theme = { tailwind: null, projectColors: {}, paletteColors: {}, fonts: {} };
  const require = createRequire(path.join(root, "package.json"));
  let pkgDir: string | null = null;
  try {
    pkgDir = path.dirname(require.resolve("tailwindcss/package.json"));
  } catch {
    return theme;
  }
  const version = String(JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")).version ?? "");
  theme.tailwind = version.startsWith("3") ? 3 : 4;

  if (theme.tailwind === 4) {
    const defaults = path.join(pkgDir, "theme.css");
    if (fs.existsSync(defaults)) {
      const css = fs.readFileSync(defaults, "utf8");
      readVars(css, "color", theme.paletteColors);
      readVars(css, "font", theme.fonts);
    }
    for (const file of listFiles(root, (n) => n.endsWith(".css"), 6)) {
      let css: string;
      try {
        css = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (!css.includes("@theme")) continue;
      const block = themeBlocks(css);
      readVars(block, "color", theme.projectColors);
      readVars(block, "font", theme.fonts);
    }
  } else {
    try {
      const colors = require("tailwindcss/colors");
      for (const [hue, v] of Object.entries<any>(colors)) {
        if (typeof v === "string") theme.paletteColors[hue] = v;
        else if (v && typeof v === "object")
          for (const [shade, hex] of Object.entries<string>(v)) theme.paletteColors[`${hue}-${shade}`] = hex;
      }
    } catch {}
    Object.assign(theme.fonts, {
      sans: "ui-sans-serif, system-ui, sans-serif",
      serif: "ui-serif, Georgia, serif",
      mono: "ui-monospace, monospace",
    });
    // Best effort: names declared in tailwind.config fontFamily / colors.
    for (const name of ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs", "tailwind.config.cjs"]) {
      const p = path.join(root, name);
      if (!fs.existsSync(p)) continue;
      const src = fs.readFileSync(p, "utf8");
      const fonts = /fontFamily\s*:\s*\{([^}]*)\}/.exec(src)?.[1] ?? "";
      for (const m of fonts.matchAll(/["']?([\w-]+)["']?\s*:/g))
        theme.fonts[m[1]] = theme.fonts[m[1]] ?? `var(--font-${m[1]})`;
      const colors = /colors\s*:\s*\{([\s\S]*?)\n\s*\}/.exec(src)?.[1] ?? "";
      for (const m of colors.matchAll(/^\s*["']?([\w-]+)["']?\s*:\s*["']([^"']+)["']/gm))
        theme.projectColors[m[1]] = m[2];
    }
  }
  // Palette entries that are actually semantic aliases (shadcn) are project colours, not palette.
  for (const k of Object.keys(theme.projectColors)) delete theme.paletteColors[k];
  return theme;
}
