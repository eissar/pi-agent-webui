import { WebSocket } from "ws";

async function runClient(index) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://127.0.0.1:5173/rpc");
    function call(method, params = undefined) {
      return new Promise((res, rej) => {
        const id = Math.random().toString(36).slice(2);
        const req = { kind: "request", id, method, params };
        const timer = setTimeout(() => rej(new Error(`Timeout on ${method}`)), 3000);
        const handler = (data) => {
          const r = JSON.parse(data.toString());
          if (r.id === id) {
            clearTimeout(timer);
            ws.off("message", handler);
            if (r.ok) res(r.result);
            else rej(r.error);
          }
        };
        ws.on("message", handler);
        ws.send(JSON.stringify(req));
      });
    }

    ws.on("open", async () => {
      try {
        console.log(`[Client ${index}] connected`);
        const p = await call("host.ping");
        const s = await call("sessions.list");
        console.log(`[Client ${index}] Ping: OK, Sessions: ${s.sessions.length}`);
        ws.close();
        resolve();
      } catch (e) {
        ws.close();
        reject(e);
      }
    });
    ws.on("error", reject);
  });
}

console.log("Testing 5 consecutive connections (simulating page reloads)...");
for (let i = 1; i <= 5; i++) {
  await runClient(i);
}
console.log("All 5 reloads passed!");
process.exit(0);
