import { chromium } from "/home/eissar/.npm/_npx/705bc6b22212b352/node_modules/playwright-core/index.mjs";

const browser = await chromium.launch({
  executablePath: "/home/eissar/.cache/puppeteer/chrome/linux-151.0.7922.71/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});

const page = await browser.newPage();
page.on("response", (res) => {
  if (res.status() === 404) {
    console.log("404 Resource:", res.url());
  }
});

await page.goto("http://localhost:5173/");
await page.waitForTimeout(2000);
await browser.close();
process.exit(0);
