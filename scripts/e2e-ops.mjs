// Background colour via the style bar, then Duplicate. Usage: node scripts/e2e-ops.mjs <url> <selector>
import puppeteer from "puppeteer-core";
const [url, selector] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 720 });
await page.goto(url, { waitUntil: "networkidle0" });
await page.waitForSelector("#crayon-overlay");
await new Promise((r) => setTimeout(r, 1200));
const sr = () => document.querySelector("#crayon-overlay").shadowRoot;
const status = () =>
  page.evaluate(() => document.querySelector("#crayon-overlay").shadowRoot.querySelector(".status").textContent);
let box = await (await page.$(selector)).boundingBox();
await page.mouse.click(box.x + 20, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 300));
// open background swatches and pick "muted"
await page.evaluate(() => {
  const b = [...document.querySelector("#crayon-overlay").shadowRoot.querySelectorAll(".style button")].find(
    (x) => x.title === "Background colour",
  );
  b.click();
});
await new Promise((r) => setTimeout(r, 200));
const picked = await page.evaluate(() => {
  const b = [...document.querySelector("#crayon-overlay").shadowRoot.querySelectorAll(".swatches button.n")].find(
    (x) => x.textContent.trim() === "muted",
  );
  if (!b) return null;
  b.click();
  return b.textContent.trim();
});
await new Promise((r) => setTimeout(r, 200));
const cls = await page.evaluate((s) => document.querySelector(s)?.className, selector);
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 1500));
console.log("picked:", picked, "| dom classes:", cls);
console.log("status 1:", await status());
// duplicate
await new Promise((r) => setTimeout(r, 1500));
box = await (await page.$(selector)).boundingBox();
await page.mouse.click(box.x + 20, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const b = [...document.querySelector("#crayon-overlay").shadowRoot.querySelectorAll(".style button")].find(
    (x) => x.textContent === "Duplicate",
  );
  b.click();
});
await new Promise((r) => setTimeout(r, 1500));
console.log("status 2:", await status());
await browser.close();
