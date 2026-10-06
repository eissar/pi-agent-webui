import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { createRpcServer } from "./src/contract/rpc.ts";
import { WebSocketMessagePort } from "./server/ws-port.ts";

const server = createRpcServer();
server.handle({
  "host.ping": () => ({ ok: true, ts: Date.now() }),
});

const httpServer = createServer((req, res) => res.end("OK"));
const wss = new WebSocketServer({ server: httpServer, path: "/rpc" });

wss.on("connection", (ws) => {
  console.log("Connected to test server!");
  const port = new WebSocketMessagePort(ws);
  server.attachPort(port);
});

httpServer.listen(7865, "127.0.0.1", async () => {
  console.log("Listening on 7865");
  const ws = new WebSocket("ws://127.0.0.1:7865/rpc");
  ws.on("open", () => {
    console.log("WebSocket open!");
    ws.send(JSON.stringify({ kind: "request", id: "1", method: "host.ping" }));
  });
  ws.on("message", (msg) => {
    console.log("Received:", msg.toString());
    ws.close();
    httpServer.close();
    process.exit(0);
  });
});
