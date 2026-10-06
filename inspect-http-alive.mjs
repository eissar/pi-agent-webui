import http from "node:http";

http.get("http://127.0.0.1:7860/healthz", (res) => {
  let d = "";
  res.on("data", (chunk) => d += chunk);
  res.on("end", () => {
    console.log("Healthz response:", res.statusCode, d);
    process.exit(0);
  });
}).on("error", (e) => {
  console.error("HTTP error:", e);
  process.exit(1);
});

setTimeout(() => {
  console.error("HTTP healthz timeout");
  process.exit(1);
}, 2000);
