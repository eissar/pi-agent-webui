import http from "node:http";

http.get("http://127.0.0.1:7860/healthz", (res) => {
  let body = "";
  res.on("data", (d) => body += d);
  res.on("end", () => {
    console.log("Healthz response:", res.statusCode, body);
    process.exit(0);
  });
}).on("error", (e) => {
  console.error("Healthz error:", e);
  process.exit(1);
});

setTimeout(() => {
  console.error("Healthz timeout");
  process.exit(1);
}, 2000);
