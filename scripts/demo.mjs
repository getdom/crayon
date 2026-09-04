// Records the README demo: hover a headline, click, type, Enter. Produces PNG frames + frames.json.
// Usage: node scripts/demo.mjs <crayon-url> <css-selector> "<new text>" <out-dir>
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const [url, selector, newText, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--hide-scrollbars", "--force-device-scale-factor=2"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 720, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle0" });
await page.waitForSelector("#crayon-overlay");
await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
await new Promise((r) => setTimeout(r, 800));

// A fake cursor drawn into the page so the GIF shows where the pointer is.
await page.evaluate(() => {
  const c = document.createElement("div");
  c.id = "__cursor";
  c.innerHTML = `<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 24 L9 18 L13 28 L17 26 L13 17 L21 17 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>`;
  Object.assign(c.style, {
    position: "fixed",
    left: "-100px",
    top: "-100px",
    zIndex: "2147483647",
    pointerEvents: "none",
    filter: "drop-shadow(0 1px 2px rgba(0,0,0,.4))",
  });
  document.documentElement.append(c);
});
const frames = [];
let n = 0;
const cursor = async (x, y) => {
  await page.mouse.move(x, y, { steps: 8 });
  await page.evaluate(
    (x, y) => Object.assign(document.getElementById("__cursor").style, { left: x - 3 + "px", top: y - 2 + "px" }),
    x,
    y,
  );
};
const shot = async (ms) => {
  const file = path.join(outDir, `f${String(n++).padStart(2, "0")}.png`);
  await page.screenshot({ path: file });
  frames.push({ file, ms });
};

const box = await (await page.$(selector)).boundingBox();
const cx = box.x + Math.min(box.width * 0.35, 260);
const cy = box.y + box.height / 2;

await cursor(cx + 260, cy + 180);
await shot(1100);
await cursor(cx, cy);
await new Promise((r) => setTimeout(r, 250));
await shot(1100);
await page.mouse.click(cx, cy);
await new Promise((r) => setTimeout(r, 350));
await shot(900);
const words = newText.split(" ");
const half = words.slice(0, Math.ceil(words.length / 2)).join(" ");
await page.keyboard.type(half, { delay: 18 });
await shot(700);
await page.keyboard.type(" " + words.slice(Math.ceil(words.length / 2)).join(" "), { delay: 18 });
await shot(900);
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 700));
await shot(1400);
await new Promise((r) => setTimeout(r, 1500));
await shot(2600);
fs.writeFileSync(path.join(outDir, "frames.json"), JSON.stringify(frames));
await browser.close();
console.log(`${frames.length} frames → ${outDir}`);
