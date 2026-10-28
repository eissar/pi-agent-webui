export const TOOL_CAPABILITY_IDS = [
  "shell.bash",
  "shell.powershell",
  "vcs.git",
  "js.node",
  "js.npm",
  "js.npx",
  "js.bun",
  "python.interpreter",
  "python.uv",
  "python.uvx",
  "search.rg",
  "search.fd",
  "data.jq",
  "network.curl",
] as const;

export type ToolCapabilityId = (typeof TOOL_CAPABILITY_IDS)[number];

export const TOOLCHAIN_ERROR_CODES = [
  "TOOLCHAIN_CAPABILITY_REQUIRED",
  "TOOLCHAIN_NODE_REQUIRED",
  "TOOLCHAIN_PYTHON_REQUIRED",
  "TOOLCHAIN_GIT_REQUIRED",
  "TOOLCHAIN_BASH_REQUIRED",
  "TOOLCHAIN_UV_REQUIRED",
  "TOOLCHAIN_INTERNAL",
] as const;

export type ToolchainErrorCode = (typeof TOOLCHAIN_ERROR_CODES)[number];

/** How to invoke one capability (bash, git, node, …) found on the server. */
export interface CommandDescriptor {
  capability: ToolCapabilityId;
  executable: string;
  argvPrefix: string[];
  binDir: string;
  /** Additional context-only PATH entries, ordered before binDir. */
  pathEntries?: string[];
  /** Additional PATH entries used only when spawning the selected shell. */
  shellPathEntries?: string[];
  version?: string;
  cwdSemantics: "native" | "posix";
  envPatch: Record<string, string>;
  /** Applied only to the Agent shell process, never to native Git/npm/Python children. */
  shellEnvPatch?: Record<string, string>;
}

export interface ToolchainResolution {
  commands: Partial<Record<ToolCapabilityId, CommandDescriptor>>;
  summary: string[];
}

export const EXECUTION_INTENTS = [
  "agent-shell",
  "managed-process",
  "skill-install",
  "plugin-install",
  "git-operation",
  "python-script",
  "project-command",
] as const;

export type ExecutionIntent = (typeof EXECUTION_INTENTS)[number];

export interface ExecutionContextRequest {
  cwd: string;
  intent: ExecutionIntent;
  trusted?: boolean;
}

export interface ToolExecutionContext {
  nativeEnv: NodeJS.ProcessEnv;
  shellEnv: NodeJS.ProcessEnv;
  commands: Partial<Record<ToolCapabilityId, CommandDescriptor>>;
  summary: string[];
}

export function isToolCapabilityId(value: unknown): value is ToolCapabilityId {
  return typeof value === "string" && (TOOL_CAPABILITY_IDS as readonly string[]).includes(value);
}
