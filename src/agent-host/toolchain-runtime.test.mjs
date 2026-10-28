import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ToolchainRuntime } from "./toolchain-runtime.ts";
import { resolveToolchainFromPath } from "./toolchain-path-resolver.ts";

function descriptor(capability, executable, binDir, version = "1.0.0") {
  return {
    capability,
    executable,
    argvPrefix: [],
    binDir,
    version,
    cwdSemantics: "native",
    envPatch: {},
  };
}

function resolution(commands) {
  return { commands, summary: ["JavaScript: node 22.19.0 (system)"] };
}

test("builds an immutable credential-sanitized environment with selected bins", async () => {
  const original = { Path: "C:\\Windows\\System32;C:\\Tools\\Node", TOKEN: "secret" };
  const commands = {
    "js.node": descriptor("js.node", "C:\\Tools\\Node\\node.exe", "C:\\Tools\\Node", "22.19.0"),
    "vcs.git": descriptor("vcs.git", "C:\\Program Files\\Git\\cmd\\git.exe", "C:\\Program Files\\Git\\cmd", "2.50.0"),
  };
  const runtime = new ToolchainRuntime({
    platform: "win32",
    baseEnv: original,
    resolve: () => resolution(commands),
  });

  const context = await runtime.createExecutionContext({ cwd: "C:\\项目", intent: "agent-shell" });
  assert.equal(context.nativeEnv.Path, "C:\\Program Files\\Git\\cmd;C:\\Tools\\Node;C:\\Windows\\System32");
  assert.equal(context.nativeEnv.TOKEN, undefined);
  assert.equal(original.Path, "C:\\Windows\\System32;C:\\Tools\\Node");
  context.commands["js.node"].argvPrefix.push("mutated");
  assert.deepEqual(runtime.prepare().commands["js.node"].argvPrefix, []);
});

test("resolves tools once and reuses the cached result", async () => {
  let resolves = 0;
  const commands = { "network.curl": descriptor("network.curl", "/usr/bin/curl", "/usr/bin") };
  const runtime = new ToolchainRuntime({
    platform: "linux",
    baseEnv: { PATH: "/usr/bin" },
    resolve: () => {
      resolves += 1;
      return resolution(commands);
    },
  });
  await runtime.createExecutionContext({ cwd: "/a", intent: "project-command" });
  await runtime.createExecutionContext({ cwd: "/b", intent: "agent-shell" });
  assert.equal(resolves, 1);
});

test("returns a structured capability error when a tool is missing", async () => {
  const runtime = new ToolchainRuntime({
    platform: "linux",
    baseEnv: { PATH: "/usr/bin" },
    resolve: () => resolution({}),
  });
  const context = await runtime.createExecutionContext({ cwd: "/workspace", intent: "skill-install" });
  assert.throws(
    () => runtime.requireFromContext("js.npx", context),
    (error) => error.code === "TOOLCHAIN_NODE_REQUIRED" && error.capability === "js.npx",
  );
});

test("executes the absolute descriptor with context-only environment", async () => {
  const commands = {
    "js.node": descriptor("js.node", process.execPath, path.dirname(process.execPath)),
  };
  const runtime = new ToolchainRuntime({
    platform: process.platform,
    baseEnv: { PATH: process.env.PATH, MARKER: "context" },
    resolve: () => resolution(commands),
  });
  const result = await runtime.exec("js.node", ["-e", "process.stdout.write(process.env.MARKER || '')"], {
    cwd: process.cwd(),
    intent: "project-command",
  });
  assert.equal(result.stdout, "context");
});

test(
  "PATH resolver finds executables in PATH order and skips missing tools",
  { skip: process.platform === "win32" },
  (t) => {
    const first = fs.mkdtempSync(path.join(os.tmpdir(), "pi-path-a-"));
    const second = fs.mkdtempSync(path.join(os.tmpdir(), "pi-path-b-"));
    t.after(() => {
      fs.rmSync(first, { recursive: true, force: true });
      fs.rmSync(second, { recursive: true, force: true });
    });
    for (const dir of [first, second]) {
      fs.writeFileSync(path.join(dir, "git"), "#!/bin/sh\n", { mode: 0o755 });
    }
    fs.writeFileSync(path.join(second, "jq"), "not executable", { mode: 0o644 });

    const resolved = resolveToolchainFromPath({ PATH: `${first}:${second}` }, "linux");
    assert.equal(resolved.commands["vcs.git"].executable, path.join(first, "git"));
    assert.equal(resolved.commands["vcs.git"].binDir, first);
    assert.equal(resolved.commands["data.jq"], undefined);
    assert.equal(resolved.commands["js.node"], undefined);
    assert.deepEqual(resolved.summary, [`git: ${path.join(first, "git")}`]);
  },
);
