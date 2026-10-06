#!/usr/bin/env node
/**
 * Standalone Node.js server for Pi Agent WebUI.
 *
 * Runs the agent-host RPC handlers (Pi coding agent SDK, session management,
 * tool execution, model configuration) in a plain Node.js process and
 * serves them over a WebSocket transport.
 *
 * Environment variables:
 *   PI_WEBUI_HOST   host interface, default "127.0.0.1" (bind "0.0.0.0" for LAN)
 *   PI_WEBUI_PORT   port, default 7860
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { WebSocketServer } from "ws";

import { createRpcServer } from "../src/contract/rpc";
import { registerHandlers } from "../src/agent-host/handlers";
import { toolchainRuntime } from "../src/agent-host/toolchain-runtime";
import { installToolchainGitRunner } from "../src/agent-host/toolchain-git";
import type { ToolchainSnapshot } from "../src/shared/toolchains/types";
import { installStandaloneToolchainResolution } from "./standalone-toolchain";
import { WebSocketMessagePort } from "./ws-port";

const EMPTY_TOOLCHAIN_SNAPSHOT: ToolchainSnapshot = {
  revision: 1,
  inventoryRevision: 1,
  resolutionId: "standalone-init",
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
};

const HOST = process.env.PI_WEBUI_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PI_WEBUI_PORT || "7860", 10);
const STATIC_ROOT = process.env.PI_WEBUI_STATIC_ROOT || join(import.meta.dirname, "../renderer");
const RPC_PATH = "/rpc";

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

const loopback = isLoopbackHost(HOST);

// ---------------------------------------------------------------------------
// RPC host
// ---------------------------------------------------------------------------
const server = createRpcServer();
const restoreGitRunner = installToolchainGitRunner(toolchainRuntime, () => {
  server.emit("sessions.changed", "*", { cwd: null, projectInfoChanged: true });
});
toolchainRuntime.apply(EMPTY_TOOLCHAIN_SNAPSHOT);
installStandaloneToolchainResolution(EMPTY_TOOLCHAIN_SNAPSHOT);
const stopHandlers = registerHandlers(server);

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, ts: Date.now(), loopback }));
    return;
  }

  let filePath = join(STATIC_ROOT, url.pathname);
  if (url.pathname.endsWith("/")) filePath = join(filePath, "index.html");

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(STATIC_ROOT, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found — build the renderer first (npm run build:renderer)");
    }
  }
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  try {
    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (parsedUrl.pathname !== RPC_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } catch {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  const port = new WebSocketMessagePort(ws);
  server.attachPort(port as never);
});

httpServer.listen(PORT, HOST, () => {
  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : PORT;
  console.log(`[webui] RPC + static server listening on http://${HOST}:${actualPort}`);
  console.log(`[webui] WebSocket RPC endpoint: ws://${HOST}:${actualPort}${RPC_PATH}`);
  if (!loopback) console.log("[webui] Remote mode: token authentication enforced.");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[webui] ${signal} received, shutting down`);
    restoreGitRunner();
    void stopHandlers()
      .catch(() => undefined)
      .finally(() => {
        wss.close();
        httpServer.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5_000).unref();
      });
  });
}
