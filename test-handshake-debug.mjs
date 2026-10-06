import http from "node:http";

const req = http.request({
  port: 7860,
  host: "127.0.0.1",
  headers: {
    Connection: "Upgrade",
    Upgrade: "websocket",
    "Sec-WebSocket-Version": "13",
    "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
  },
  path: "/rpc",
});

req.on("upgrade", (res, socket, head) => {
  console.log("Upgrade successful! Status:", res.statusCode);
  socket.destroy();
  process.exit(0);
});

req.on("error", (e) => {
  console.error("HTTP error:", e);
  process.exit(1);
});

setTimeout(() => {
  console.error("HTTP upgrade timed out after 2s");
  process.exit(1);
}, 2000);

req.end();
