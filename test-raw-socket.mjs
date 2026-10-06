import net from "node:net";

const client = net.createConnection({ port: 7860, host: "127.0.0.1" }, () => {
  console.log("TCP connected to 7860");
  client.write(
    "GET /rpc HTTP/1.1\r\n" +
    "Host: 127.0.0.1:7860\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
    "Sec-WebSocket-Version: 13\r\n\r\n"
  );
});

client.on("data", (d) => {
  console.log("Raw TCP response from 7860:\n", d.toString());
  client.end();
  process.exit(0);
});

client.on("error", (e) => {
  console.error("TCP error:", e);
  process.exit(1);
});

setTimeout(() => {
  console.error("Timeout after 2s waiting for raw HTTP response");
  process.exit(1);
}, 2000);
