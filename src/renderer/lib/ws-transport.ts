/**
 * Browser WebSocket transport — standalone backend mode.
 *
 * Adapts a browser WebSocket to the RpcClientPort shape expected by
 * createRpcClient() in @contract/rpc. The wire protocol is identical to the
 * MessagePort contract, so no protocol changes are needed.
 */

/** Resolve the standalone backend RPC endpoint.
 * Priority: `?rpc=` query param → localStorage("pi.webuiRpcUrl") → build-time VITE_RPC_URL → same origin `/rpc`.
 *
 * Set `VITE_RPC_URL` (e.g. `ws://mini-server:7860/rpc`) to decouple the renderer from the
 * backend host: the Vite dev server (or any static host of out/renderer) can then be proxied
 * or forwarded alone, with the browser connecting straight to the backend's WebSocket. */
export function resolveRpcUrl(): string {
  const override =
    new URLSearchParams(window.location.search).get("rpc") ?? localStorage.getItem("pi.webuiRpcUrl");
  if (override) return override;
  const envUrl = import.meta.env.VITE_RPC_URL;
  if (typeof envUrl === "string" && envUrl.length > 0) return envUrl;
  const wsScheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsScheme}//${window.location.host}/rpc`;
}

type MessageListener = (event: { data: unknown }) => void;
type CloseListener = () => void;

export function createWebSocketPort(
  url: string,
  token?: string | null,
): {
  port: {
    addEventListener(type: "message", listener: MessageListener): void;
    addEventListener(type: "close", listener: CloseListener): void;
    removeEventListener(type: "message", listener: MessageListener): void;
    removeEventListener(type: "close", listener: CloseListener): void;
    postMessage(message: unknown): void;
    start(): void;
    close(): void;
  };
  opened: Promise<void>;
} {
  const wsUrl = token ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : url;
  const ws = new WebSocket(wsUrl);

  const messageListeners = new Set<MessageListener>();
  const closeListeners = new Set<CloseListener>();

  ws.addEventListener("message", (ev: MessageEvent) => {
    let data: unknown = ev.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        // Keep raw if not JSON
      }
    }
    const syntheticEvent = { data };
    for (const listener of [...messageListeners]) {
      try {
        listener(syntheticEvent);
      } catch (err) {
        console.error("[ws-transport] listener error:", err);
      }
    }
  });

  ws.addEventListener("close", () => {
    for (const listener of [...closeListeners]) {
      try {
        listener();
      } catch (err) {
        console.error("[ws-transport] close listener error:", err);
      }
    }
  });

  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error(`WebSocket connection failed: ${url}`)), { once: true });
  });

  return {
    port: {
      addEventListener(type: "message" | "close", listener: any) {
        if (type === "message") {
          messageListeners.add(listener);
        } else if (type === "close") {
          closeListeners.add(listener);
        }
      },
      removeEventListener(type: "message" | "close", listener: any) {
        if (type === "message") {
          messageListeners.delete(listener);
        } else if (type === "close") {
          closeListeners.delete(listener);
        }
      },
      postMessage(message) {
        if (ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket is not open");
        ws.send(typeof message === "string" ? message : JSON.stringify(message));
      },
      start() {
        /* browser WebSockets deliver messages immediately */
      },
      close() {
        ws.close();
      },
    },
    opened,
  };
}

export function getStoredToken(): string | null {
  return new URLSearchParams(window.location.search).get("token") ?? localStorage.getItem("pi.webuiToken");
}
