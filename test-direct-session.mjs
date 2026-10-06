import { WebSocket } from "ws";

const ws = new WebSocket("ws://127.0.0.1:7860/rpc");

function call(method, params = undefined) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const req = { kind: "request", id, method, params };
    console.log(`[calling] ${method}...`);
    const timer = setTimeout(() => reject(new Error(`Timeout on ${method}`)), 4000);
    const handler = (data) => {
      const res = JSON.parse(data.toString());
      if (res.id === id) {
        clearTimeout(timer);
        ws.off("message", handler);
        if (res.ok) resolve(res.result);
        else reject(res.error);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify(req));
  });
}

ws.on("open", async () => {
  try {
    console.log("Connected directly to ws://127.0.0.1:7860/rpc");
    
    const ping = await call("host.ping");
    console.log("✓ host.ping:", ping);

    const sessionsRes = await call("sessions.list");
    console.log(`✓ sessions.list: found ${sessionsRes.sessions?.length ?? 0} sessions.`);

    ws.close();
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    ws.close();
    process.exit(1);
  }
});

ws.on("error", (err) => {
  console.error("Connection error:", err);
  process.exit(1);
});
