import http from "node:http";

const req = http.request({
  port: 7860,
  host: "127.0.0.1",
  headers: {
    Connection: "Upgrade",
    Upgrade: "websocket",
    "Sec-WebSocket-Version": "13",
    "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    Origin: "http://localhost:5173",
  },
  path: "/rpc",
});

req.on("upgrade", (res, socket) => {
  console.log("UPGRADE COMPLETED! Status:", res.statusCode);
  socket.destroy();
  process.exit(0);
});

req.on("error", (e) => {
  console.error("HTTP error:", e);
  process.exit(1);
});

setTimeout(() => {
  console.error("Upgrade timed out");
  process.exit(1);
}, 2000);

req.end();
