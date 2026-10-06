import { WebSocket } from "ws";

const ws = new WebSocket("ws://127.0.0.1:7860/rpc");
const timer = setTimeout(() => {
  console.error("Step 1 Timeout");
  ws.terminate();
  process.exit(1);
}, 2000);

ws.on("open", () => {
  console.log("Step 1: Connected!");
  ws.send(JSON.stringify({ kind: "request", id: "1", method: "host.ping" }));
});

ws.on("message", (msg) => {
  console.log("Step 1: Received:", msg.toString());
  clearTimeout(timer);
  ws.close();
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("Step 1 Error:", err);
  process.exit(1);
});
