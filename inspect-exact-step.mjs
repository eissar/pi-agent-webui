import { chromium } from "/home/eissar/.npm/_npx/705bc6b22212b352/node_modules/playwright-core/index.mjs";

const browser = await chromium.launch({
  executablePath: "/home/eissar/.cache/puppeteer/chrome/linux-151.0.7922.71/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});

const page = await browser.newPage();
page.on("console", (m) => console.log("PAGE CONSOLE:", m.text()));
await page.goto("http://localhost:5173/");

const stepResult = await page.evaluate(async () => {
  const { resolveRpcUrl, getStoredToken, createWebSocketPort } = await import("/lib/ws-transport.ts");
  console.log("Resolved RPC URL:", resolveRpcUrl());
  console.log("Token:", getStoredToken());
  const { port, opened } = createWebSocketPort(resolveRpcUrl(), getStoredToken());
  console.log("Waiting for opened promise...");
  try {
    await opened;
    console.log("Opened promise resolved!");
    return { ok: true };
  } catch (e) {
    console.error("Opened promise rejected:", e);
    return { ok: false, error: e.message };
  }
});

console.log("\nStep Result:", stepResult);
await browser.close();
