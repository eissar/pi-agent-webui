import { installBrowserBridge } from "./src/renderer/lib/browser-bridge.ts";

globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};
globalThis.navigator = { userAgent: "Node" };

installBrowserBridge();
console.log("piBridge installed:", Boolean(globalThis.piBridge));
const uiState = await globalThis.piBridge.getUiState();
console.log("uiState:", uiState);
process.exit(0);
