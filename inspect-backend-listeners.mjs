import { WebSocket } from "ws";

const ws = new WebSocket("ws://127.0.0.1:7860/rpc", {
  headers: {
    Origin: "http://localhost:5173",
  },
});

ws.on("open", () => {
  console.log("Connected with browser Origin header!");
  ws.send(JSON.stringify({ kind: "request", id: "1", method: "host.ping" }));
});

ws.on("message", (data) => {
  console.log("Received:", data.toString());
  ws.close();
  process.exit(0);
});

ws.on("error", (e) => {
  console.error("Error with Origin header:", e);
  process.exit(1);
});

setTimeout(() => {
  console.error("Timeout with Origin header");
  process.exit(1);
}, 3000);
