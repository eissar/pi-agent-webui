/**
 * WebSocket ↔ MessagePort adapter.
 *
 * The contract RPC server (src/contract/rpc.ts) speaks to "AnyMessagePort"
 * shapes (DOM MessagePort / worker MessagePort). This adapter wraps a single
 * WebSocket connection so createRpcServer().attachPort() can serve browsers
 * over a WebSocket without changing the wire protocol.
 */
import type { WebSocket as WsWebSocket } from "ws";

type Listener = (ev: { data: unknown }) => void;

export class WebSocketMessagePort {
  private messageListeners = new Set<Listener>();
  private closeListeners = new Set<Listener>();
  private closed = false;

  constructor(private readonly ws: WsWebSocket) {
    ws.on("message", (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(String(raw));
      } catch {
        return; // ignore non-JSON frames
      }
      for (const listener of [...this.messageListeners]) {
        try {
          listener({ data });
        } catch {
          /* isolate subscriber errors */
        }
      }
    });

    const cleanup = () => {
      if (this.closed) return;
      this.closed = true;
      for (const listener of [...this.closeListeners]) {
        try {
          listener({ data: null });
        } catch {
          /* isolate listener errors */
        }
      }
    };

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  }

  addEventListener(type: "message" | "close", listener: Listener): void {
    if (type === "message") this.messageListeners.add(listener);
    else if (type === "close") this.closeListeners.add(listener);
  }

  removeEventListener(type: "message" | "close", listener: Listener): void {
    if (type === "message") this.messageListeners.delete(listener);
    else if (type === "close") this.closeListeners.delete(listener);
  }

  on(event: string, listener: (...args: any[]) => void): void {
    if (event === "message") {
      this.addEventListener("message", (ev) => listener(ev.data));
    } else if (event === "close") {
      this.addEventListener("close", () => listener());
    }
  }

  off(event: string, listener: (...args: any[]) => void): void {
    // Basic off handler
  }

  postMessage(message: unknown): void {
    if (this.closed || this.ws.readyState !== 1 /* WebSocket.OPEN */) return;
    try {
      this.ws.send(JSON.stringify(message));
    } catch {
      /* transport failures surface via 'close' */
    }
  }

  start(): void {
    /* no-op: ws delivers messages immediately */
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}
