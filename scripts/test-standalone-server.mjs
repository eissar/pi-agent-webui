/**
 * Integration tests for the standalone browser backend (server/main.ts).
 *
 * Boots the real server (built bundle) on ephemeral ports with an isolated
 * PI_CODING_AGENT_DIR, then exercises the WebSocket RPC contract:
 *
 *   1. host.ping over the WS transport
 *   2. sessions.list / agent.new / agent.state (session essentials)
 *   3. models.list (model catalog from local config)
 *   4. Unsupported desktop features fail explicitly (herdr.*)
 *   5. Remote binding requires a token; wrong/missing token is rejected
 *
 * Usage: npm run build:server && node scripts/test-standalone-server.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";

const ROOT = path.resolve(import.meta.dirname, "..");
let failures = 0;

function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function startServer(env) {
  const child = spawn(process.execPath, [path.join(ROOT, "out/server/main.mjs")], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  return { child, getOutput: () => output };
}

async function waitForServer(port) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await delay(100);
  }
  throw new Error("server did not start");
}

async function resolvePort(getOutput) {
  for (let i = 0; i < 100; i += 1) {
    const match = /listening on http:\/\/[\d.]+:(\d+)/.exec(getOutput());
    if (match) return Number(match[1]);
    await delay(100);
  }
  throw new Error(`server port not printed:\n${getOutput()}`);
}

/** Minimal RPC client over WebSocket (same wire protocol as src/contract/rpc.ts). */
function createTestRpc(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  let closed = false;

  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.kind === "response" && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.ok) resolve(msg.result);
      else reject(Object.assign(new Error(msg.error?.message ?? "RPC error"), { code: msg.error?.code }));
    }
  });

  return {
    opened: new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    }),
    call(method, params, timeoutMs = 30_000) {
      const id = `t${nextId++}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`timeout: ${method}`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        ws.send(JSON.stringify({ kind: "request", id, method, params }));
      });
    },
    close() {
      closed = true;
      ws.close();
    },
    get closed() {
      return closed || ws.readyState === WebSocket.CLOSED;
    },
  };
}

const agentDir = mkdtempSync(path.join(tmpdir(), "pi-webui-test-"));
const cwd = mkdtempSync(path.join(tmpdir(), "pi-webui-cwd-"));

try {
  // ---------------------------------------------------------------------------
  console.log("[1] loopback server: RPC contract over WebSocket");
  // ---------------------------------------------------------------------------
  const loopback = startServer({
    PI_WEBUI_PORT: "0",
    PI_CODING_AGENT_DIR: agentDir,
  });
  const port = await resolvePort(loopback.getOutput);
  await waitForServer(port);
  const rpc = createTestRpc(`ws://127.0.0.1:${port}/rpc`);
  await rpc.opened;
  console.log(`  (server on 127.0.0.1:${port})`);

  const ping = await rpc.call("host.ping");
  check("host.ping", ping?.ok === true && typeof ping?.ts === "number");

  const sessions = await rpc.call("sessions.list");
  check("sessions.list", Array.isArray(sessions?.sessions) && Array.isArray(sessions?.runningSessionIds));

  const newSession = await rpc.call("agent.new", { cwd });
  check(
    "agent.new returns sessionId",
    typeof newSession?.sessionId === "string" && newSession.sessionId.length > 0,
    JSON.stringify(newSession),
  );

  const state = await rpc.call("agent.state", { sessionId: newSession.sessionId });
  check("agent.state for new session", typeof state?.running === "boolean");

  const renamed = await rpc.call("sessions.rename", { id: newSession.sessionId, name: "webui-mvp-test" });
  check("sessions.rename", renamed?.ok === true);

  const models = await rpc.call("models.list", {});
  check(
    "models.list returns catalog shape",
    typeof models === "object" && models !== null && ("providers" in models || "models" in models),
    JSON.stringify(models).slice(0, 120),
  );

  // Subscribe should be accepted server-side (no error, subscription recorded).
  let eventReceived = null;
  wsEventLoop: try {
    // sessions.changed fires on session mutations; rename again to trigger it
    const rawSub = new WebSocket(`ws://127.0.0.1:${port}/rpc`);
    await new Promise((resolve, reject) => {
      rawSub.on("open", resolve);
      rawSub.on("error", reject);
    });
    rawSub.send(JSON.stringify({ kind: "subscribe", id: "s1", topic: "sessions.changed", key: "*" }));
    const gotEvent = new Promise((resolve) => {
      rawSub.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.kind === "event" && msg.topic === "sessions.changed") resolve(msg);
      });
    });
    await rpc.call("sessions.rename", { id: newSession.sessionId, name: "webui-mvp-test-2" });
    eventReceived = await Promise.race([gotEvent, delay(5_000).then(() => null)]);
    rawSub.close();
  } catch {
    /* handled below */
  }
  check("server emits sessions.changed events to subscribers", eventReceived !== null);

  // Unsupported desktop features must fail explicitly, never fake success.
  const herdr = await rpc
    .call("herdr.snapshot")
    .then((v) => ({ ok: true, v }))
    .catch((err) => ({ ok: false, err }));
  check("herdr.snapshot fails explicitly in standalone mode", herdr.ok === false, JSON.stringify(herdr.v));

  const unknown = await rpc
    .call("host.doesNotExist")
    .then(() => ({ ok: true }))
    .catch((err) => ({ ok: false, err }));
  check("unknown method → METHOD_NOT_FOUND", unknown.ok === false && unknown.err.code === "METHOD_NOT_FOUND");

  // Static file serving + healthz
  const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
  check("healthz", health?.ok === true && health?.loopback === true && health?.authRequired === false);
  const indexRes = await fetch(`http://127.0.0.1:${port}/`);
  check("static / falls back (renderer not built) or serves index", indexRes.status === 200 || indexRes.status === 404);
  const traversal = await fetch(`http://127.0.0.1:${port}/../package.json`);
  check("path traversal blocked", traversal.status !== 200 || !(await traversal.text()).includes('"name"'));

  rpc.close();
  loopback.child.kill("SIGTERM");
  await delay(500);
  if (!loopback.child.killed) loopback.child.kill("SIGKILL");

  // ---------------------------------------------------------------------------
  console.log("[2] remote binding requires token");
  // ---------------------------------------------------------------------------
  const remote = startServer({
    PI_WEBUI_HOST: "0.0.0.0",
    PI_WEBUI_PORT: "0",
    PI_CODING_AGENT_DIR: agentDir,
  });
  const remotePort = await resolvePort(remote.getOutput);
  await waitForServer(remotePort);
  const tokenMatch = /PI_WEBUI_TOKEN: (\S+)/.exec(remote.getOutput());
  check(
    "remote mode auto-generates a token",
    tokenMatch !== null,
    `server output: ${remote.getOutput().slice(0, 400)}`,
  );
  const remoteHealth = await fetch(`http://127.0.0.1:${remotePort}/healthz`).then((r) => r.json());
  check("remote healthz reports authRequired", remoteHealth?.authRequired === true);

  const denied = createTestRpc(`ws://127.0.0.1:${remotePort}/rpc`);
  const deniedResult = await denied.opened.then(
    () => "connected",
    () => "rejected",
  );
  check("connection without token is rejected", deniedResult === "rejected");
  try {
    denied.close();
  } catch {
    /* ignore */
  }

  const allowed = createTestRpc(`ws://127.0.0.1:${remotePort}/rpc?token=${encodeURIComponent(tokenMatch?.[1] ?? "")}`);
  const allowedResult = await allowed.opened.then(
    () => "connected",
    () => "rejected",
  );
  check("connection with correct token succeeds", allowedResult === "connected");
  const remotePing = await allowed.call("host.ping");
  check("host.ping over token-authenticated remote connection", remotePing?.ok === true);
  allowed.close();

  remote.child.kill("SIGTERM");
  await delay(500);
  if (!remote.child.killed) remote.child.kill("SIGKILL");
} finally {
  rmSync(agentDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll standalone-server integration tests passed");
