// Click a selector, append text at the end of its content, press Enter, print the toolbar status.
import puppeteer from "puppeteer-core";
const [url, selector, appendText] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 720 });
await page.goto(url, { waitUntil: "networkidle0" });
await page.waitForSelector("#crayon-overlay");
await new Promise((r) => setTimeout(r, 1500));
const box = await (await page.$(selector)).boundingBox();
await page.mouse.click(box.x + 20, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 300));
const before = await page.evaluate((s) => document.querySelector(s)?.innerHTML, selector);
await page.keyboard.press("End");
await page.keyboard.type(appendText, { delay: 10 });
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 1500));
const status = await page.evaluate(
  () => document.querySelector("#crayon-overlay").shadowRoot.querySelector(".status").textContent,
);
console.log("before:", before.slice(0, 120));
console.log("status:", status);
await browser.close();
