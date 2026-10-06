/**
 * Agent Host — standalone Node entry.
 * Runs pi-coding-agent in-process; serves Api/Streams over attached ports.
 */
import { createRpcServer } from "../contract/rpc";
import { registerHandlers } from "./handlers";
import { startSessionWatcher } from "./session-watcher";
import { toolchainRuntime } from "./toolchain-runtime";
import { installToolchainGitRunner } from "./toolchain-git";

const server = createRpcServer();
const restoreGitRunner = installToolchainGitRunner(toolchainRuntime, () => {
  // Emitted after the Host accepts the revision and invalidates its Git cache.
  // Chat histories are unchanged; only project metadata needs reconciliation.
  server.emit("sessions.changed", "*", { cwd: null, projectInfoChanged: true });
});
const stopHandlers = registerHandlers(server);
const stopWatcher = startSessionWatcher(server);

function log(message: string): void {
  console.log(`[agent-host] ${message}`);
}

process.on("uncaughtException", (err) => {
  log(`uncaughtException: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  // Do not keep serving requests from a potentially corrupted Host. The main
  // process supervisor will restart this utility process within its budget.
  setImmediate(() => process.exit(1));
});
process.on("unhandledRejection", (err) => {
  log(`unhandledRejection: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  setImmediate(() => process.exit(1));
});

// Keep alive
setInterval(() => {}, 1 << 30);
