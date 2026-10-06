import { chromium } from "/home/eissar/.npm/_npx/705bc6b22212b352/node_modules/playwright-core/index.mjs";

const browser = await chromium.launch({
  executablePath: "/home/eissar/.cache/puppeteer/chrome/linux-151.0.7922.71/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});

const page = await browser.newPage();
page.on("requestfinished", (req) => {
  const res = req.response();
  if (res && res.status() >= 400) {
    console.log("Failed request:", req.url(), res.status());
  }
});

await page.goto("http://localhost:5173/favicon.ico");
await browser.close();
process.exit(0);
