/**
 * Transport facade — all renderer → Host communication goes through here.
 * Components call these helpers; they never touch MessagePort directly.
 */
import { createRpcClient, type PiRpc } from "@contract/rpc";
import type { ApiMethod, ApiParams, ApiResult, StreamTopic, Streams } from "@contract/api";
import type { AgentCommand } from "@contract/types";
import { notify } from "./notifications";
import { createWebSocketPort, getStoredToken, resolveRpcUrl } from "./ws-transport";

let rpc: PiRpc | null = null;
let connectPromise: Promise<PiRpc> | null = null;

// ---------------------------------------------------------------------------
// Connection status (standalone WebSocket mode): the UI stays mounted on drop,
// disables inputs, and we reconnect + resubscribe in the background.
// ---------------------------------------------------------------------------

export type ConnectionStatus = "connected" | "reconnecting";
export interface ConnectionSnapshot {
  status: ConnectionStatus;
  attempt: number;
  /** ms until next retry (0 while an attempt is in flight) */
  nextRetryMs: number;
}

let connection: ConnectionSnapshot = { status: "connected", attempt: 0, nextRetryMs: 0 };
const connectionListeners = new Set<() => void>();
function setConnection(next: ConnectionSnapshot): void {
  connection = next;
  for (const l of [...connectionListeners]) l();
}
export function subscribeConnection(listener: () => void): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}
export function getConnectionSnapshot(): ConnectionSnapshot {
  return connection;
}

type LiveSub = { topic: StreamTopic; key: string; on: (ev: never) => void; off: (() => void) | null };
const liveSubs = new Set<LiveSub>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function handleSocketClosed(client: PiRpc): void {
  if (rpc !== client) return; // intentional reset or stale client
  rpc = null;
  connectPromise = null;
  for (const s of liveSubs) s.off = null; // server-side subs died with the socket
  notify.error("Lost connection to backend", "connection");
  scheduleReconnect(1);
}

function scheduleReconnect(attempt: number): void {
  const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15_000);
  setConnection({ status: "reconnecting", attempt, nextRetryMs: delay });
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => attemptReconnect(attempt), delay);
}

function attemptReconnect(attempt: number): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  setConnection({ status: "reconnecting", attempt, nextRetryMs: 0 });
  ensureRpc().then(
    (client) => {
      for (const s of liveSubs) s.off = client.subscribe(s.topic, s.key, s.on as never);
      setConnection({ status: "connected", attempt: 0, nextRetryMs: 0 });
      notify.success("Reconnected to backend", "connection");
    },
    () => scheduleReconnect(attempt + 1),
  );
}

/** Retry immediately (used by the "Retry now" button). */
export function reconnectNow(): void {
  if (connection.status !== "reconnecting" || connection.nextRetryMs === 0) return;
  attemptReconnect(connection.attempt);
}

/** Drop RPC client so the next ensureRpc() re-connects (Host crash recovery). */
export function resetRpc(): void {
  try {
    rpc?.close();
  } catch {
    /* ignore */
  }
  rpc = null;
  connectPromise = null;
}

const HOST_READY_TIMEOUT_MS = 30_000;
const PORT_TIMEOUT_MS = 15_000;
const PING_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} (timeout ${ms}ms)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Receive Host MessagePort transferred from preload via window.postMessage. */

/** Standalone browser mode: connect to the Node backend over WebSocket. */
async function connectOverWebSocket(): Promise<PiRpc> {
  const { port, opened } = createWebSocketPort(resolveRpcUrl(), getStoredToken());
  await withTimeout(opened, PORT_TIMEOUT_MS, "WebSocket connection failed");
  const client = createRpcClient(port as never);
  await withTimeout(client.call("host.ping"), PING_TIMEOUT_MS, "host.ping failed");
  rpc = client;
  port.addEventListener("close", () => handleSocketClosed(client));
  return client;
}

function requestHostPort(): Promise<MessagePort> {
  return new Promise((resolve, reject) => {
    if (!window.piBridge) {
      reject(new Error("piBridge not available — not running inside Electron?"));
      return;
    }

    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for host MessagePort"));
    }, PORT_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      // Only accept messages from our own window (preload → page)
      if (event.source !== window) return;
      const data = event.data as { channel?: string } | string | null;
      const isPortMsg =
        data === "pi-desktop-host-port" || (typeof data === "object" && data?.channel === "pi-desktop-host-port");
      if (!isPortMsg) return;
      const port = event.ports[0];
      if (!port) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(port);
    };

    window.addEventListener("message", onMessage);
    window.piBridge.requestHostPort();
  });
}

async function waitForHostReady(): Promise<void> {
  if (!window.piBridge) {
    throw new Error("piBridge not available — not running inside Electron?");
  }
  let status = await window.piBridge.getHostStatus();
  if (status === "ready") return;
  if (status === "crashed") {
    throw new Error("Agent Host crashed before UI connected");
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`Agent Host not ready (status=${status})`));
    }, HOST_READY_TIMEOUT_MS);

    const off = window.piBridge!.onHostStatus((s) => {
      status = s.status;
      if (s.status === "ready") {
        clearTimeout(timer);
        off();
        resolve();
      } else if (s.status === "crashed") {
        clearTimeout(timer);
        off();
        reject(new Error(s.detail || "Agent Host crashed"));
      }
    });

    // Race: status may flip ready between getHostStatus and subscribe
    void window.piBridge!.getHostStatus().then((s) => {
      if (s === "ready") {
        clearTimeout(timer);
        off();
        resolve();
      } else if (s === "crashed") {
        clearTimeout(timer);
        off();
        reject(new Error("Agent Host crashed"));
      }
    });
  });
}

export async function ensureRpc(): Promise<PiRpc> {
  if (rpc) return rpc;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    if (!window.piBridge?.isDesktop) {
      return connectOverWebSocket();
    }
    await waitForHostReady();
    const port = await requestHostPort();
    const client = createRpcClient(port);
    await withTimeout(client.call("host.ping"), PING_TIMEOUT_MS, "host.ping failed");
    rpc = client;
    return client;
  })();

  try {
    return await connectPromise;
  } catch (e) {
    connectPromise = null;
    rpc = null;
    throw e;
  }
}

export function getRpc(): PiRpc | null {
  return rpc;
}

export async function call<M extends ApiMethod>(
  method: M,
  ...args: ApiParams<M> extends void ? [] | [void] : [ApiParams<M>]
): Promise<ApiResult<M>> {
  const client = await ensureRpc();
  return client.call(method, ...(args as never));
}

export async function subscribe<T extends StreamTopic>(
  topic: T,
  key: string,
  on: (ev: Streams[T]) => void,
): Promise<() => void> {
  const client = await ensureRpc();
  const entry: LiveSub = { topic, key, on: on as (ev: never) => void, off: null };
  entry.off = client.subscribe(topic, key, on);
  liveSubs.add(entry);
  return () => {
    liveSubs.delete(entry);
    entry.off?.();
    entry.off = null;
  };
}

// ---------------------------------------------------------------------------
// Domain helpers used by Renderer consumers
// ---------------------------------------------------------------------------

export async function listSessions() {
  return call("sessions.list");
}

export async function getSession(
  id: string,
  includeState?: boolean,
  traceId?: string,
  historyWindow?: ApiParams<"sessions.get">["historyWindow"],
) {
  return call("sessions.get", { id, includeState, traceId, historyWindow });
}

export async function getSessionContext(
  id: string,
  leafId?: string,
  historyWindow?: ApiParams<"sessions.context">["historyWindow"],
) {
  return call("sessions.context", { id, leafId, historyWindow });
}

export async function getSessionContextPage(id: string, cursor: string, maxTurns?: number, maxBytes?: number) {
  return call("sessions.contextPage", { id, cursor, maxTurns, maxBytes });
}

export async function getSessionEntryContent(id: string, entryId: string, blockIndex?: number) {
  return call("sessions.entryContent", { id, entryId, blockIndex });
}

export async function newAgent(params: ApiParams<"agent.new">) {
  return call("agent.new", params);
}

/** Open transport entry: Host validates the envelope and dispatches the payload. */
export async function agentCommand(sessionId: string, command: AgentCommand) {
  return call("agent.command", { sessionId, command });
}

export async function agentState(sessionId: string) {
  return call("agent.state", { sessionId });
}

export async function getCacheWarmingStatus() {
  return call("settings.getCacheWarming");
}

export async function setCacheWarmingMode(mode: "off" | "streaming" | "idle") {
  return call("settings.setCacheWarming", { mode });
}

export async function listModels(cwd?: string) {
  return call("models.list", cwd ? { cwd } : undefined);
}

export async function refreshModels(cwd: string | undefined, requestId: string) {
  return call("models.refresh", { ...(cwd ? { cwd } : {}), requestId });
}

export async function cancelModelsRefresh(requestId: string) {
  return call("models.refreshCancel", { requestId });
}

export async function getModelPreferences(cwd?: string) {
  return call("models.preferences.get", cwd ? { cwd } : undefined);
}

export async function setModelPreferences(cwd: string | undefined, enabledModels: string[] | null) {
  return call("models.preferences.set", { ...(cwd ? { cwd } : {}), enabledModels });
}

export async function fileIndex(root: string, query?: string) {
  return call("files.index", { root, query });
}

export async function subscribeAgentEvents(sessionId: string, on: (ev: Streams["agent.events"]) => void) {
  return subscribe("agent.events", sessionId, on);
}

export async function subscribeRunning(on: (ev: Streams["agent.running"]) => void) {
  return subscribe("agent.running", "*", on);
}

export async function subscribeSessionsChanged(on: (ev: Streams["sessions.changed"]) => void) {
  return subscribe("sessions.changed", "*", on);
}

export async function subscribeAuthLogin(provider: string, on: (ev: Streams["auth.login"]) => void) {
  return subscribe("auth.login", provider, on);
}
