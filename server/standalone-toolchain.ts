/**
 * Standalone toolchain resolution.
 *
 * In the Electron app, the main process owns the bundled toolchain inventory
 * and answers "toolchain.resolve" parent-RPC requests. The standalone backend
 * has no main process, so we resolve capabilities directly from PATH instead.
 * Missing capabilities are simply absent from the resolution — dependent tools
 * then fail with a clear "not available" error.
 */
import { accessSync, constants } from "node:fs";
import path from "node:path";
import type { CommandDescriptor, ToolCapabilityId, ToolchainResolution } from "../src/shared/toolchains/types";
import { toolchainRuntime } from "../src/agent-host/toolchain-runtime";
import type { ToolchainSnapshot } from "../src/shared/toolchains/types";

const CAPABILITY_EXECUTABLES: Array<[ToolCapabilityId, string, string]> = [
  ["shell.bash", "bash", "bash"],
  ["shell.powershell", "pwsh", "pwsh"],
  ["vcs.git", "git", "git"],
  ["js.node", "node", "node"],
  ["js.npm", "npm", "npm"],
  ["js.npx", "npx", "npx"],
  ["js.bun", "bun", "bun"],
  ["python.interpreter", "python3", "python3"],
  ["python.uv", "uv", "uv"],
  ["python.uvx", "uvx", "uvx"],
  ["search.rg", "rg", "rg"],
  ["search.fd", "fd", "fd"],
  ["data.jq", "jq", "jq"],
  ["network.curl", "curl", "curl"],
];

function findExecutable(name: string): string | null {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function buildResolution(cwd: string): ToolchainResolution {
  const commands: Partial<Record<ToolCapabilityId, CommandDescriptor>> = {};
  const summary: string[] = [];
  for (const [capability, binary, label] of CAPABILITY_EXECUTABLES) {
    const executable = findExecutable(binary);
    if (!executable) continue;
    commands[capability] = {
      capability,
      provider: "system",
      executable,
      argvPrefix: [],
      binDir: path.dirname(executable),
      cwdSemantics: "posix",
      envPatch: {},
    };
    summary.push(`${label}: ${executable}`);
  }
  return {
    id: `standalone-${Date.now().toString(36)}`,
    inventoryRevision: 1,
    workspaceKey: cwd,
    requirementsHash: "standalone",
    commands,
    summary,
  };
}

/**
 * Patch the agent-host's ToolchainRuntime singleton to resolve in-process.
 * The private members are compile-time only; this keeps the original
 * agent-host sources unmodified while making them work without Electron.
 */
export function installStandaloneToolchainResolution(emptySnapshot: ToolchainSnapshot): void {
  const runtime = toolchainRuntime as unknown as {
    resolveProject: unknown;
    fetchSnapshot: unknown;
  };
  runtime.resolveProject = async (cwd: string) => buildResolution(cwd);
  runtime.fetchSnapshot = async () => emptySnapshot;
}
