import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { createRpcServer } from "./src/contract/rpc.ts";
import { registerHandlers } from "./src/agent-host/handlers.ts";
import { toolchainRuntime } from "./src/agent-host/toolchain-runtime.ts";
import { WebSocketMessagePort } from "./server/ws-port.ts";

const server = createRpcServer();
toolchainRuntime.apply({
  revision: 1,
  inventoryRevision: 1,
  resolutionId: "init",
  platform: process.platform,
  arch: process.arch,
  coreReady: true,
  state: {
    schemaVersion: 1,
    revision: 1,
    platform: process.platform,
    arch: process.arch,
    coreReady: true,
    capabilities: {},
    components: {},
    operations: [],
  },
});
registerHandlers(server);

const httpServer = createServer((req, res) => res.end("OK"));
const wss = new WebSocketServer({ server: httpServer, path: "/rpc" });

wss.on("connection", (ws) => {
  console.log("Client connected to test-server-isolation!");
  const port = new WebSocketMessagePort(ws);
  server.attachPort(port);
});

httpServer.listen(8765, "127.0.0.1", async () => {
  console.log("Listening on 8765");
  const { chromium } = await import("/home/eissar/.npm/_npx/705bc6b22212b352/node_modules/playwright-core/index.mjs");
  const browser = await chromium.launch({
    executablePath: "/home/eissar/.cache/puppeteer/chrome/linux-151.0.7922.71/chrome-linux64/chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/");

  const pingRes = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const ws = new WebSocket("ws://127.0.0.1:8765/rpc");
      ws.onopen = () => {
        ws.send(JSON.stringify({ kind: "request", id: "t1", method: "host.ping" }));
      };
      ws.onmessage = (e) => {
        resolve({ ok: true, data: JSON.parse(e.data) });
        ws.close();
      };
      ws.onerror = () => resolve({ ok: false, error: "ws error" });
      setTimeout(() => resolve({ ok: false, error: "timeout" }), 3000);
    });
  });

  console.log("Browser evaluate against test server:", pingRes);
  await browser.close();
  httpServer.close();
  process.exit(0);
});
