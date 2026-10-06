import { WebSocket } from "ws";

const ws = new WebSocket("ws://127.0.0.1:7860/rpc");

ws.on("open", () => {
  console.log("Connected");
  const req = { kind: "request", id: "1", method: "host.ping", params: undefined };
  console.log("Sending host.ping...");
  ws.send(JSON.stringify(req));
});

ws.on("message", (raw) => {
  console.log("Received:", raw.toString());
  ws.close();
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("Error:", err);
  process.exit(1);
});
