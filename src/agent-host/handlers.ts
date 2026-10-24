/**
 * Register all Api handlers on the RPC server.
 * Implements the desktop RPC contract in the Agent Host process.
 */
import { modelCatalogHandlers } from "./handlers/model-catalog";
import { modelConfigHandlers } from "./handlers/models-config";
import { createAuthHandlers } from "./handlers/auth";
import { createFileHandlers } from "./handlers/files";
import { createWorktreeHandlers } from "./handlers/worktrees";
import { systemHandlers } from "./handlers/system";
import { createSessionHandlers } from "./handlers/sessions";
import { createTitleHandlers } from "./handlers/agent-title";
import { createAgentHandlers } from "./handlers/agent";
import { resourceHandlers } from "./handlers/resources";
export { generateSessionTitleWithFallback, applySessionNameIfEmpty } from "./handlers/agent-title";
export { createAgentNewLockKey } from "./handlers/agent";

export { projectModelsList } from "./handlers/model-catalog";
export { credentialMutationFailure } from "./handlers/auth";

import type { RpcServer, RpcRequestContext } from "../contract/rpc";
import { createSessionEventBindings } from "./session-event-bindings";
import { createHostShutdown } from "./host-shutdown";
import { RpcError } from "../contract/types";

import { disposeAllRpcSessions, subscribeRunningSessions } from "./rpc-manager";

import { createFileWatchService, stopAllFileWatches } from "./file-watch";
import { createAuthLoginService } from "./auth-login";
import { modelCatalogRefreshCoordinator } from "./model-runtime";

export function registerHandlers(server: RpcServer): () => Promise<void> {
  const bindings = createSessionEventBindings(server);
  let closing = false;
  const fileWatch = createFileWatchService(server);
  const fileHandlers = createFileHandlers(fileWatch);
  const authLogin = createAuthLoginService(server);
  const authHandlers = createAuthHandlers(authLogin);
  const worktreeHandlers = createWorktreeHandlers();
  const sessionHandlers = createSessionHandlers({ server, clearSessionEventBinding: bindings.clear });

  const stopRunning = subscribeRunningSessions((ids) => {
    if (closing) return;
    // Both fields remain in the current stream contract for renderer compatibility.
    server.emit("agent.running", "*", {
      type: "running",
      sessionIds: ids,
      runningSessionIds: ids,
    } as never);
  });

  const agentHandlers = createAgentHandlers({
    server,
    bindEvents: (session, id) => bindings.ensure(session, id),
  });
  const titleHandlers = createTitleHandlers(server);

  const guard =
    <P, R>(handler: (params: P, context: RpcRequestContext) => R) =>
    (params: P, context: RpcRequestContext): R => {
      if (closing) throw new RpcError({ code: "CLOSED", message: "Agent Host is shutting down" });
      return handler(params, context);
    };

  server.handle({
    "host.ping": guard(() => ({ ok: true as const, ts: Date.now() })),

    "sessions.list": guard(sessionHandlers.list),

    "sessions.get": guard(sessionHandlers.get),

    "sessions.context": guard(sessionHandlers.context),

    "sessions.contextPage": guard(sessionHandlers.contextPage),

    "sessions.entryContent": guard(sessionHandlers.entryContent),

    "sessions.delete": guard(sessionHandlers.delete),

    "sessions.rename": guard(sessionHandlers.rename),

    "worktrees.list": guard(worktreeHandlers.list),

    "agent.new": guard(agentHandlers.new),

    "agent.command": guard(agentHandlers.command),

    "agent.state": guard(agentHandlers.state),

    "agent.generateTitle": guard(titleHandlers.generate),

    "files.read": guard(fileHandlers.read),

    "files.download": guard(fileHandlers.download),

    "files.index": guard(fileHandlers.index),

    "settings.getCacheWarming": guard(resourceHandlers.getCacheWarming),

    "settings.setCacheWarming": guard(resourceHandlers.setCacheWarming),

    "models.list": guard(modelCatalogHandlers.list),

    "models.refresh": guard(modelCatalogHandlers.refresh),

    "models.refreshCancel": guard(modelCatalogHandlers.cancelRefresh),

    "models.preferences.get": guard(modelCatalogHandlers.getPreferences),

    "models.preferences.set": guard(modelCatalogHandlers.setPreferences),

    "modelsConfig.get": guard(modelConfigHandlers.get),
    "modelsConfig.set": guard(modelConfigHandlers.set),
    "modelsConfig.test": guard(modelConfigHandlers.test),

    "auth.providers": guard(authHandlers.providers),

    "auth.allProviders": guard(authHandlers.allProviders),

    "auth.setApiKey": guard(authHandlers.setApiKey),

    "auth.deleteApiKey": guard(authHandlers.deleteApiKey),

    "auth.logout": guard(authHandlers.logout),

    "auth.loginSubmit": guard(authHandlers.submitLogin),

    "auth.loginStart": guard(authHandlers.startLogin),

    "auth.loginCancel": guard(authHandlers.cancelLogin),

    "skills.list": guard(resourceHandlers.listSkills),

    "skills.search": guard(resourceHandlers.searchSkills),

    "skills.install": guard(resourceHandlers.installSkill),

    "skills.set": guard(resourceHandlers.setSkill),

    "skills.getContent": guard(resourceHandlers.getSkillContent),

    "plugins.list": guard(resourceHandlers.listPlugins),

    "plugins.set": guard(resourceHandlers.setPlugin),

    "files.watchStart": guard(fileHandlers.startWatch),

    "files.watchStop": guard(fileHandlers.stopWatch),

    "system.home": guard(systemHandlers.home),

    "system.validateCwd": guard(systemHandlers.validateCwd),

    "system.defaultCwd": guard(systemHandlers.defaultCwd),
  });

  const shutdown = createHostShutdown([
    { name: "running subscription", stop: stopRunning },
    { name: "session event bindings", stop: bindings.close },
    { name: "authentication flows", stop: () => authLogin.dispose() },
    { name: "model refreshes", stop: () => modelCatalogRefreshCoordinator.cancelAll() },
    { name: "file watches", stop: stopAllFileWatches },
    { name: "Agent sessions", stop: disposeAllRpcSessions },
  ]);
  return () => {
    closing = true;
    return shutdown();
  };
}
