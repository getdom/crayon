// Plain-CSS site: click a text, pick a :root variable as background, then a custom colour for the text.
import puppeteer from "puppeteer-core";
const [url, text, varName, customColor] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 720 });
await page.goto(url, { waitUntil: "networkidle0" });
await page.waitForSelector("#crayon-overlay");
await new Promise((r) => setTimeout(r, 2500));
const handle = await page.evaluateHandle(
  (t) =>
    [...document.querySelectorAll("button, a, span, p, h1, h2, h3")]
      .filter((e) => e.textContent.trim() === t)
      .sort((x, y) => x.innerHTML.length - y.innerHTML.length)[0],
  text,
);
await handle.evaluate((e) => e.scrollIntoView({ block: "center" }));
await new Promise((r) => setTimeout(r, 800));
const box = await handle.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 500));
const sr = "document.querySelector('#crayon-overlay').shadowRoot";
const bar = await page.evaluate(() =>
  [...document.querySelector("#crayon-overlay").shadowRoot.querySelectorAll(".style > *")]
    .map((e) => e.tagName + ":" + (e.title || e.textContent.trim()))
    .join(" | "),
);
console.log("bar:", bar);
const status = () =>
  page.evaluate(() => document.querySelector("#crayon-overlay").shadowRoot.querySelector(".status").textContent);
// background → variable
await page.evaluate(() =>
  [...document.querySelector("#crayon-overlay").shadowRoot.querySelectorAll(".style button")]
    .find((b) => b.title === "Background")
    .click(),
);
await new Promise((r) => setTimeout(r, 200));
const picked = await page.evaluate((n) => {
  const b = [...document.querySelector("#crayon-overlay").shadowRoot.querySelectorAll(".swatches button.n")].find(
    (x) => x.textContent.trim() === n,
  );
  if (!b) return null;
  b.click();
  return n;
}, varName);
await new Promise((r) => setTimeout(r, 1200));
console.log("bg:", picked, "|", await status());
// text colour → custom
await page.evaluate(() =>
  [...document.querySelector("#crayon-overlay").shadowRoot.querySelectorAll(".style button")]
    .find((b) => b.title === "Color")
    .click(),
);
await new Promise((r) => setTimeout(r, 200));
await page.evaluate((c) => {
  const sr = document.querySelector("#crayon-overlay").shadowRoot;
  const i = sr.querySelector(".swatches input");
  i.value = c;
  [...sr.querySelectorAll(".swatches button.n")].find((b) => b.textContent === "Apply").click();
}, customColor);
await new Promise((r) => setTimeout(r, 1200));
console.log("color:", customColor, "|", await status());
await page.keyboard.press("Escape");
await browser.close();
