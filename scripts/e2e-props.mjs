// Click a text rendered by a component, wait for the variant selects, set variant=outline.
import puppeteer from "puppeteer-core";
const [url, text] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 720 });
await page.goto(url, { waitUntil: "networkidle0" });
await page.waitForSelector("#crayon-overlay");
await new Promise((r) => setTimeout(r, 1200));
const handle = await page.evaluateHandle(
  (t) =>
    [...document.querySelectorAll("button, a, span, p, h1, h2, h3")]
      .filter((e) => e.textContent.trim() === t)
      .sort((x, y) => x.innerHTML.length - y.innerHTML.length)[0],
  text,
);
const box = await handle.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 1500));
const bar = await page.evaluate(() =>
  [...document.querySelector("#crayon-overlay").shadowRoot.querySelectorAll(".style > *")]
    .map((e) => e.tagName + ":" + (e.title || e.textContent.trim()))
    .join(" | "),
);
console.log("bar:", bar);
const set = await page.evaluate(() => {
  const s = [...document.querySelector("#crayon-overlay").shadowRoot.querySelectorAll(".style select")].find(
    (x) => x.title === "variant",
  );
  if (!s) return null;
  s.value = process.argv[4] || "outline";
  s.dispatchEvent(new Event("change"));
  return s.value;
});
await new Promise((r) => setTimeout(r, 1500));
console.log(
  "set:",
  set,
  "| status:",
  await page.evaluate(() => document.querySelector("#crayon-overlay").shadowRoot.querySelector(".status").textContent),
);
await browser.close();
