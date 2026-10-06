import { listAllSessions } from "./src/agent-host/session-reader.ts";

console.log("Starting listAllSessions()...");
const start = Date.now();
const s = await listAllSessions();
console.log(`Done in ${Date.now() - start}ms. Found ${s.length} sessions.`);
process.exit(0);
