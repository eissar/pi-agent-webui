import { WebSocket } from "ws";

console.log("Direct connection from Node to ws://127.0.0.1:7860/rpc");
const ws = new WebSocket("ws://127.0.0.1:7860/rpc");

ws.on("open", () => {
  console.log("SUCCESS: Directly opened ws://127.0.0.1:7860/rpc in Node!");
  ws.close();
  process.exit(0);
});

ws.on("error", (e) => {
  console.error("FAIL: Error connecting to 7860:", e);
  process.exit(1);
});

setTimeout(() => {
  console.error("FAIL: Timeout after 2s");
  process.exit(1);
}, 2000);
