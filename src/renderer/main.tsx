import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import { App } from "./App";
import "./globals.css";
import { ensureRpc } from "./lib/api-client";
import { installBrowserBridge } from "./lib/browser-bridge";

// In a plain browser there is no Electron preload; install the browser-mode
// bridge shim (localStorage-backed UI state, desktop-only features disabled)
// before anything touches window.piBridge.
installBrowserBridge();

// Boot RPC early so the first UI interactions are ready
void ensureRpc().catch((err) => {
  console.error("[pi-desktop] failed to connect to agent host:", err);
});

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
