import { WebSocket } from "ws";

function testConnection(label) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Starting test for ${label} ---`);
    const ws = new WebSocket("ws://127.0.0.1:7860/rpc");
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`${label} timed out after 4000ms`));
    }, 4000);

    ws.on("open", () => {
      console.log(`${label}: WebSocket OPEN, sending host.ping...`);
      ws.send(JSON.stringify({ kind: "request", id: "p1", method: "host.ping" }));
    });

    ws.on("message", (data) => {
      console.log(`${label}: Received message:`, data.toString());
      clearTimeout(timeout);
      ws.close();
      resolve();
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      console.error(`${label}: Error:`, err);
      reject(err);
    });
  });
}

try {
  await testConnection("Connection 1 (First load)");
  await new Promise((r) => setTimeout(r, 500));
  await testConnection("Connection 2 (Second load / Reload)");
  console.log("\nSuccess: Both connections succeeded.");
  process.exit(0);
} catch (err) {
  console.error("\nFailed:", err.message);
  process.exit(1);
}
