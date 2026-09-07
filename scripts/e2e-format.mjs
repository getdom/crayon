// Click a selector, select its first two words with the keyboard, press ⌘B, Enter. Prints the toolbar status.
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
const box = await (await page.$(selector)).boundingBox();
await page.mouse.click(box.x + 20, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 300));
await page.keyboard.press("Home");
await page.keyboard.down("Shift");
for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowRight", { commands: ["moveWordRightAndModifySelection"] });
await page.keyboard.up("Shift");
const selected = await page.evaluate(() => window.getSelection()?.toString());
await page.keyboard.down("Meta");
await page.keyboard.press("b");
await page.keyboard.up("Meta");
await new Promise((r) => setTimeout(r, 200));
const html = await page.evaluate((s) => document.querySelector(s)?.innerHTML, selector);
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 1500));
const status = await page.evaluate(
  () => document.querySelector("#crayon-overlay").shadowRoot.querySelector(".status").textContent,
);
console.log("selected:", JSON.stringify(selected));
console.log("dom:", html.slice(0, 140));
console.log("status:", status);
await browser.close();
