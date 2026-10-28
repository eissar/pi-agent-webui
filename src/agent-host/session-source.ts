const sessionSources = new WeakMap<object, "local">();

export function setAgentSessionSource(sessionManager: object, source: "local"): void {
  sessionSources.set(sessionManager, source);
}

export function getAgentSessionSource(sessionManager: object): "local" | "unknown" {
  return sessionSources.get(sessionManager) ?? "unknown";
}

