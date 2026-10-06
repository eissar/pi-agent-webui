import { WebSocket } from "ws";

console.log("Creating WebSocket to ws://127.0.0.1:7860/rpc...");
const ws = new WebSocket("ws://127.0.0.1:7860/rpc");

ws.on("open", () => {
  console.log("WebSocket opened successfully!");
  ws.close();
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err);
  process.exit(1);
});

ws.on("unexpected-response", (req, res) => {
  console.error(`Unexpected response: ${res.statusCode} ${res.statusMessage}`);
  process.exit(1);
});

setTimeout(() => {
  console.error("Timeout after 3s waiting for open event");
  process.exit(1);
}, 3000);
