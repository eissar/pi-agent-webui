/**
 * Finds developer tools (bash, git, node, …) on the server's PATH.
 *
 * Missing tools are left out of the resolution; anything that needs one then
 * fails with a structured "capability required" error.
 */
import { accessSync, constants } from "node:fs";
import path from "node:path";
import type { CommandDescriptor, ToolCapabilityId, ToolchainResolution } from "../shared/toolchains/types";

const CAPABILITY_EXECUTABLES: ReadonlyArray<readonly [ToolCapabilityId, string]> = [
  ["shell.bash", "bash"],
  ["shell.powershell", "pwsh"],
  ["vcs.git", "git"],
  ["js.node", "node"],
  ["js.npm", "npm"],
  ["js.npx", "npx"],
  ["js.bun", "bun"],
  ["python.interpreter", "python3"],
  ["python.uv", "uv"],
  ["python.uvx", "uvx"],
  ["search.rg", "rg"],
  ["search.fd", "fd"],
  ["data.jq", "jq"],
  ["network.curl", "curl"],
];

function findExecutable(name: string, pathValue: string, platform: NodeJS.Platform): string | null {
  const delimiter = platform === "win32" ? ";" : ":";
  const names = platform === "win32" ? [`${name}.exe`, `${name}.cmd`, name] : [name];
  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    for (const candidateName of names) {
      const candidate = path.join(dir, candidateName);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

function pathFromEnv(env: NodeJS.ProcessEnv): string {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH");
  return (key && env[key]) || "";
}

export function resolveToolchainFromPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): ToolchainResolution {
  const pathValue = pathFromEnv(env);
  const commands: Partial<Record<ToolCapabilityId, CommandDescriptor>> = {};
  const summary: string[] = [];
  for (const [capability, binary] of CAPABILITY_EXECUTABLES) {
    const executable = findExecutable(binary, pathValue, platform);
    if (!executable) continue;
    commands[capability] = {
      capability,
      executable,
      argvPrefix: [],
      binDir: path.dirname(executable),
      cwdSemantics: platform === "win32" ? "native" : "posix",
      envPatch: {},
    };
    summary.push(`${binary}: ${executable}`);
  }
  return { commands, summary };
}
