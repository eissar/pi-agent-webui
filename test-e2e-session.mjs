import { WebSocket } from "ws";

const ws = new WebSocket("ws://127.0.0.1:5173/rpc");

function call(method, params = undefined) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const req = { kind: "request", id, method, params };
    const handler = (data) => {
      const res = JSON.parse(data.toString());
      if (res.id === id) {
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
    console.log("Connected to ws://127.0.0.1:5173/rpc");
    
    // 1. Ping
    const ping = await call("host.ping");
    console.log("✓ host.ping:", ping);

    // 2. List sessions
    const sessionsRes = await call("sessions.list");
    console.log(`✓ sessions.list: found ${sessionsRes.sessions?.length ?? 0} total sessions across workspaces.`);
    if (sessionsRes.sessions?.length > 0) {
      console.log("   Sample session cwd:", sessionsRes.sessions[0].cwd);
      console.log("   Sample session title:", sessionsRes.sessions[0].title);
    }

    // 3. Models list
    const models = await call("models.list");
    console.log(`✓ models.list: discovered ${models.models?.length ?? 0} configured models.`);

    // 4. File tree
    const tree = await call("files.tree", { cwd: process.cwd(), depth: 1 });
    console.log(`✓ files.tree: read ${tree.entries?.length ?? 0} entries at root.`);

    console.log("\nAll core WebUI RPC endpoints tested successfully!");
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
