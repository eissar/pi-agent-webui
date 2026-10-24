import type {
  AgentCommand,
  AgentEvent,
  ApiKeyProviderStatus,
  CredentialMutationResult,
  DirEntry,
  EntryContentResult,
  FileContent,
  FileMeta,
  HistoryWindow,
  LoginProgressEvent,
  ModelPreferencesResult,
  ModelsConfig,
  ModelsConfigSnapshot,
  ModelsListResult,
  PagedContextInfo,
  ProviderStatus,
  RunningStateEvent,
  SessionDetail,
  SessionInfo,
  TestResult,
  WorktreeInfo,
} from "./types";
import type {
  GitStatusResult,
  PluginActionParams,
  PluginsResponse,
  SkillRecord,
  SkillSearchResult,
  SkillUpdateParams,
} from "../shared/api-types";
import type { ToolCapabilityId, ToolProvider } from "../shared/toolchains/types";
import type {
  ManagedProcessChangedEvent,
  ManagedProcessLogStream,
  ManagedProcessLogWindow,
  ManagedProcessOutputEvent,
  ManagedProcessPublicInfo,
  ManagedProcessReadParams,
  ManagedProcessWaitParams,
  ManagedProcessWriteParams,
} from "./processes";

/** Request/response API surface (replaces HTTP routes). */
export interface Api {
  "host.ping": { params: void; result: { ok: true; ts: number } };

  // Managed background processes (trusted Renderer control surface)
  "processes.list": {
    params: { includeExited?: boolean } | void;
    result: { revision: number; processes: ManagedProcessPublicInfo[] };
  };
  "processes.get": {
    params: { processId: string };
    result: ManagedProcessPublicInfo;
  };
  "processes.read": {
    params: ManagedProcessReadParams;
    result: ManagedProcessLogWindow;
  };
  "processes.wait": {
    params: ManagedProcessWaitParams;
    result: ManagedProcessLogWindow;
  };
  "processes.write": {
    params: ManagedProcessWriteParams;
    result: { ok: true; runId: string };
  };
  "processes.stop": {
    params: { processId: string; runId: string; mode?: "graceful" | "force" };
    result: ManagedProcessPublicInfo;
  };
  "processes.stopAll": {
    params: { mode?: "graceful" | "force" } | void;
    result: { ok: true; stopped: number };
  };
  "processes.restart": {
    params: { processId: string; runId: string };
    result: ManagedProcessPublicInfo;
  };
  "processes.dismiss": {
    params: { processId: string };
    result: { ok: true };
  };
  "processes.export": {
    params: { processId: string; runId: string; streams?: ManagedProcessLogStream[] };
    result: { saved: boolean; fileName?: string };
  };

  // Sessions & projects
  "sessions.list": {
    params: { cwd?: string } | void;
    result: { sessions: SessionInfo[]; runningSessionIds: string[] };
  };
  "sessions.get": {
    params: { id: string; includeState?: boolean; traceId?: string; historyWindow?: HistoryWindow };
    result: SessionDetail;
  };
  "sessions.context": {
    params: { id: string; leafId?: string; historyWindow?: HistoryWindow };
    result: { context: PagedContextInfo };
  };
  "sessions.contextPage": {
    params: { id: string; cursor: string; maxTurns?: number; maxBytes?: number };
    result: { context: PagedContextInfo };
  };
  "sessions.entryContent": {
    params: { id: string; entryId: string; blockIndex?: number };
    result: EntryContentResult;
  };
  "sessions.delete": { params: { id: string; force?: boolean }; result: { ok: true } };
  "sessions.rename": {
    params: { id: string; name: string };
    result: { ok: true };
  };

  "worktrees.list": {
    params: { projectRoot: string };
    result: {
      worktrees: WorktreeInfo[];
      projectRoot: string;
      isGit: boolean;
      isTopLevel: boolean;
    };
  };

  // Agent lifecycle
  "agent.new": {
    params: {
      cwd: string;
      type?: string;
      message?: string;
      provider?: string;
      modelId?: string;
      toolNames?: string[];
      thinkingLevel?: string;
      [key: string]: unknown;
    };
    result: { sessionId: string; data?: unknown };
  };
  "agent.command": {
    params: { sessionId: string; command: AgentCommand };
    result: unknown;
  };
  "agent.state": {
    params: { sessionId: string };
    result: { running: boolean; state?: unknown };
  };
  /** Generate a concise session title from the first user message (silent LLM request, never touches session history). */
  "agent.generateTitle": {
    params: {
      sessionId: string;
      message: string;
      provider?: string;
      modelId?: string;
    };
    result: { title: string | null };
  };

  // Files
  "files.read": {
    params: { path: string; sourceSessionId?: string };
    result: FileContent & {
      encoding?: "utf8" | "base64" | "too_large";
      mime?: string;
    };
  };
  "files.download": {
    params: { path: string; sourceSessionId?: string };
    result: { base64: string; size: number; mime: string };
  };
  "files.index": {
    params: { root: string; query?: string };
    result: {
      files: string[];
      truncated: boolean;
      truncatedReason?: "depth" | "count";
      matches?: Array<{ path: string; isDir?: boolean; score?: number }>;
      degradedReason?: "search-unavailable" | "search-timeout" | "search-failed";
    };
  };
  "files.watchStart": {
    params: { path: string; sourceSessionId?: string; watchId?: string };
    result: { ok: true };
  };
  "files.watchStop": {
    params: { path: string; watchId?: string };
    result: { ok: true };
  };

  // Config
  "settings.getCacheWarming": {
    params: void;
    result: {
      mode: "off" | "streaming" | "idle";
      scope: "global";
      loadFailed: boolean;
      pendingSessionCount: number;
    };
  };
  "settings.setCacheWarming": {
    params: { mode: "off" | "streaming" | "idle" };
    result: {
      mode: "off" | "streaming" | "idle";
      scope: "global";
      loadFailed: boolean;
      pendingSessionCount: number;
    };
  };
  "models.list": {
    params: { cwd?: string } | void;
    result: ModelsListResult;
  };
  "models.refresh": {
    params: { cwd?: string; requestId: string };
    result: ModelsListResult;
  };
  "models.refreshCancel": {
    params: { requestId: string };
    result: { ok: true; cancelled: boolean };
  };
  "models.preferences.get": {
    params: { cwd?: string } | void;
    result: ModelPreferencesResult;
  };
  "models.preferences.set": {
    params: { cwd?: string; enabledModels: string[] | null };
    result: ModelPreferencesResult;
  };
  "modelsConfig.get": { params: void; result: ModelsConfigSnapshot };
  "modelsConfig.set": {
    params: { config: ModelsConfig; expectedVersion: string };
    result: { ok: true; version: string };
  };
  "modelsConfig.test": {
    params: {
      providerName?: string;
      provider?: Record<string, unknown>;
      model?: Record<string, unknown>;
      [key: string]: unknown;
    };
    result: TestResult;
  };

  "auth.providers": { params: void; result: { providers: ProviderStatus[] } };
  "auth.allProviders": { params: void; result: { providers: ApiKeyProviderStatus[] } };
  "auth.setApiKey": {
    params: { provider: string; key: string };
    result: CredentialMutationResult;
  };
  "auth.deleteApiKey": {
    params: { provider: string };
    result: CredentialMutationResult;
  };
  "auth.logout": { params: { provider: string }; result: CredentialMutationResult };
  "auth.loginSubmit": {
    params: { provider: string; token: string; code: string };
    result: { ok: true };
  };
  /** Kick off OAuth login; progress arrives on Streams["auth.login"]. */
  "auth.loginStart": {
    params: { provider: string };
    result: { ok: true; started: boolean };
  };
  "auth.loginCancel": {
    params: { provider: string };
    result: { ok: true };
  };

  "skills.list": {
    params: { cwd?: string } | void;
    result: { skills: SkillRecord[]; diagnostics?: unknown[] };
  };
  "skills.search": {
    params: { query: string };
    result: { results: SkillSearchResult[] };
  };
  "skills.install": {
    params: { package: string; scope?: "global" | "project"; cwd?: string };
    result: { ok: true; output: string };
  };
  "skills.set": {
    params: SkillUpdateParams;
    result: { ok: true };
  };
  "skills.getContent": {
    params: { cwd: string; filePath: string };
    result: { content: string };
  };

  "plugins.list": {
    params: { cwd?: string } | void;
    result: PluginsResponse;
  };
  "plugins.set": {
    params: PluginActionParams;
    result: PluginsResponse;
  };

  // System / desktop helpers exposed via Host (or main-bridged)
  "system.home": { params: void; result: { home: string } };
  "system.validateCwd": {
    params: { path: string };
    result: { ok: boolean; path?: string; error?: string };
  };
  "system.defaultCwd": { params: void; result: { cwd: string } };
}

/** Server-push streams delivered over MessagePort RPC. */
export interface Streams {
  "agent.events": AgentEvent;
  "agent.running": RunningStateEvent;
  "auth.login": LoginProgressEvent;
  "sessions.changed": {
    cwd: string | null;
    sessionId?: string;
    session?: SessionInfo;
    deleted?: boolean;
    fullRefresh?: boolean;
    /** Project metadata was invalidated after the Git toolchain changed. */
    projectInfoChanged?: boolean;
  };
  "files.changed": {
    path: string;
    event: "connected" | "change" | "error";
    mtime?: string;
    size?: number;
    message?: string;
  };
  "processes.changed": ManagedProcessChangedEvent;
  "processes.output": ManagedProcessOutputEvent;
}

export type ApiMethod = keyof Api;
export type StreamTopic = keyof Streams;

export type ApiParams<M extends ApiMethod> = Api[M]["params"];
export type ApiResult<M extends ApiMethod> = Api[M]["result"];
