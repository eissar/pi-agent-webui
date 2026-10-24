#!/usr/bin/env node
/**
 * Development orchestrator for Pi Agent WebUI.
 *
 * Builds and starts the standalone Node backend, waits until its HTTP/WebSocket
 * endpoint accepts connections, then starts the Vite dev server in the
 * foreground. Terminating this process (Ctrl-C, SIGTERM) tears both down.
 *
 * Usage:
 *   npm run dev
 *   npm run dev -- --host 0.0.0.0 --port 5173
 *   npm run dev -- --watch --host 0.0.0.0   (rebuild + restart backend on change)
 *
 * `--watch` is consumed here; all other arguments are forwarded verbatim to Vite.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { terminateProcessTree } from "./process-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawArgs = process.argv.slice(2);
const watchMode = rawArgs.includes("--watch");
const viteArgs = rawArgs.filter((arg) => arg !== "--watch");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status ?? "null"}`);
  }
}

const backendHost = process.env.PI_WEBUI_HOST || "127.0.0.1";
const backendPort = process.env.PI_WEBUI_PORT || "7860";

let backend = null;
let restartingBackend = false;

function startBackend() {
  const child = spawn(process.execPath, [path.join(root, "out/server/main.mjs")], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
    detached: process.platform !== "win32",
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown || restartingBackend || child !== backend) return;
    console.error(`[dev] backend exited unexpectedly (code=${code}, signal=${signal})`);
    shutdown(code ?? 1);
  });
  backend = child;
}

async function stopBackend() {
  const child = backend;
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  terminateProcessTree(child);
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
}

let shuttingDown = false;
let vite = null;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (vite) terminateProcessTree(vite);
  terminateProcessTree(backend);
  const timer = setTimeout(() => process.exit(code), 3000);
  timer.unref?.();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

/** Probe the backend health endpoint once; resolves true only on HTTP 200. */
function probeBackend(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 1000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

/** Poll the backend HTTP endpoint until it responds or we give up. */
async function waitForBackend(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://${backendHost === "0.0.0.0" ? "127.0.0.1" : backendHost}:${backendPort}/healthz`;
  while (Date.now() < deadline) {
    if (backend?.exitCode !== null && backend?.exitCode !== undefined)
      throw new Error("backend exited before becoming ready");
    if (await probeBackend(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`backend did not become ready at ${url} within ${timeoutMs}ms`);
}

async function launchBackendAndWait() {
  startBackend();
  await waitForBackend();
  console.log(`[dev] backend ready on ${backendHost}:${backendPort}`);
}

try {
  if (watchMode) {
    console.log("[dev] building backend (tsup --watch)...");
    const { build } = await import("tsup");
    const { default: configs } = await import("../tsup.config.ts");
    let firstBuild;
    const firstBuildDone = new Promise((resolve, reject) => {
      firstBuild = { resolve, reject };
    });
    let pending = Promise.resolve();
    const onSuccess = () => {
      // Serialize restarts so overlapping rebuilds cannot race each other.
      pending = pending.then(async () => {
        if (shuttingDown) return;
        if (!backend) {
          await launchBackendAndWait();
          firstBuild.resolve();
          return;
        }
        console.log("[dev] rebuilt; restarting backend...");
        restartingBackend = true;
        try {
          await stopBackend();
          await launchBackendAndWait();
        } finally {
          restartingBackend = false;
        }
      });
      pending.catch((error) => {
        console.error(`[dev] ${error.message}`);
        if (!backend || shuttingDown) firstBuild.reject(error);
      });
      return pending;
    };
    for (const config of configs) {
      build({ ...config, watch: true, onSuccess }).catch((error) => firstBuild.reject(error));
    }
    await firstBuildDone;
  } else {
    console.log("[dev] building backend (tsup)...");
    run("npx", ["tsup"]);
    console.log("[dev] starting backend...");
    await launchBackendAndWait();
  }
} catch (error) {
  console.error(`[dev] ${error.message}`);
  shutdown(1);
}

console.log("[dev] starting Vite...");

vite = spawn("npx", ["vite", ...viteArgs], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
  detached: process.platform !== "win32",
});

vite.on("exit", (code, signal) => {
  if (shuttingDown) return;
  shutdown(code ?? (signal ? 1 : 0));
});
