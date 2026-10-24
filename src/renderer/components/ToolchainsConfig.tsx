import { useEffect, useState } from "react";
import type {
  ManagedComponentId,
  PublicCapabilityState,
  PublicManagedComponentState,
  PublicToolchainCacheState,
  PublicToolchainOperation,
  PublicToolchainState,
  ToolCapabilityId,
  ToolHealth,
  ToolPreference,
  ToolProvider,
  ToolchainActionRequest,
  ToolchainCacheId,
} from "@shared/toolchains/types";
import { TOOL_PREFERENCES } from "@shared/toolchains/types";
import { useIsMobile } from "@/hooks/useIsMobile";

const TOOL_CATEGORIES: ReadonlyArray<{
  id: "javascript" | "python" | "cli";
  capabilities: readonly ToolCapabilityId[];
}> = [
  {
    id: "javascript",
    capabilities: ["js.node", "js.npm", "js.npx", "js.bun"],
  },
  {
    id: "python",
    capabilities: ["python.interpreter", "python.uv", "python.uvx"],
  },
  {
    id: "cli",
    capabilities: ["shell.bash", "shell.powershell", "vcs.git", "search.rg", "search.fd", "data.jq", "network.curl"],
  },
];

const CAPABILITY_COMPONENTS: Partial<Record<ToolCapabilityId, ManagedComponentId>> = {
  "js.node": "node-lts",
  "js.bun": "bun",
  "python.interpreter": "cpython",
  "python.uv": "uv",
  "vcs.git": "portable-git",
  "search.rg": "ripgrep",
  "search.fd": "fd",
  "data.jq": "jq",
};

const CAPABILITY_CACHES: Partial<Record<ToolCapabilityId, ToolchainCacheId>> = {
  "js.npm": "npm",
  "js.bun": "bun",
  "python.uv": "uv",
};

const CAPABILITY_LABELS: Record<ToolCapabilityId, string> = {
  "shell.bash": "Bash",
  "shell.powershell": "PowerShell",
  "vcs.git": "Git",
  "js.node": "Node.js",
  "js.npm": "npm",
  "js.npx": "npx",
  "js.bun": "Bun",
  "python.interpreter": "Python",
  "python.uv": "uv",
  "python.uvx": "uvx",
  "search.rg": "ripgrep (rg)",
  "search.fd": "fd",
  "data.jq": "jq",
  "network.curl": "curl",
};

const COMPONENT_LABELS: Record<ManagedComponentId, string> = {
  "portable-git": "PortableGit",
  "node-lts": "Node.js LTS + npm",
  cpython: "CPython",
  uv: "uv + uvx",
  ripgrep: "ripgrep",
  fd: "fd",
  jq: "jq",
  bun: "Bun",
};

const CACHE_LABELS: Record<ToolchainCacheId, string> = {
  npm: "npm",
  uv: "uv",
  bun: "Bun",
  downloads: "Downloads",
};

type DeveloperToolSelection = ToolCapabilityId;

function toolCategoryTitle(category: (typeof TOOL_CATEGORIES)[number]["id"]): string {
  switch (category) {
    case "javascript":
      return "JavaScript";
    case "python":
      return "Python";
    case "cli":
      return "CLI essentials";
  }
}

export function ToolchainsConfig({ cwd }: { cwd?: string | null }) {
  const [state, setState] = useState<PublicToolchainState | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = window.piBridge.onToolchainState((nextState) => {
      if (disposed) return;
      if (!cwd) {
        setState(nextState);
        setFailed(false);
        return;
      }
      void window.piBridge
        .getToolchainState(cwd)
        .then((projectState) => {
          if (!disposed) {
            setState(projectState);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!disposed) setFailed(true);
        });
    });
    void window.piBridge
      .rescanToolchains(cwd ?? undefined)
      .then((nextState) => {
        if (!disposed) setState(nextState);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [cwd]);

  const performAction = async (request: ToolchainActionRequest): Promise<void> => {
    const actionId = actionKey(request);
    setPendingAction(actionId);
    setActionError(null);
    setFailed(false);
    try {
      const actionState =
        request.action === "rescan"
          ? await window.piBridge.rescanToolchains(cwd ?? undefined)
          : await window.piBridge.performToolchainAction(request);
      const nextState = cwd && request.action !== "rescan" ? await window.piBridge.getToolchainState(cwd) : actionState;
      setState(nextState);
    } catch (error) {
      if (!String(error).includes("TOOLCHAIN_CANCELLED")) setActionError(friendlyToolchainError(error));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <ToolchainStateView
      state={state}
      failed={failed}
      rescanPending={pendingAction === "rescan"}
      pendingAction={pendingAction}
      actionError={actionError}
      onRescan={() => void performAction({ action: "rescan" })}
      onAction={(request) => void performAction(request)}
    />
  );
}

export function ToolchainStateView({
  state,
  failed,
  rescanPending,
  pendingAction = null,
  actionError = null,
  onRescan,
  onAction,
}: {
  state: PublicToolchainState | null;
  failed: boolean;
  rescanPending: boolean;
  pendingAction?: string | null;
  actionError?: string | null;
  onRescan: () => void;
  onAction?: (request: ToolchainActionRequest) => void;
}) {
  const isMobile = useIsMobile();
  const [selected, setSelected] = useState<DeveloperToolSelection>("js.node");
  const selectedCapability = selected;
  const capabilityState = selectedCapability ? state?.capabilities[selectedCapability] : undefined;
  const componentId = CAPABILITY_COMPONENTS[selectedCapability];
  const component = componentId ? state?.components[componentId] : undefined;
  const cacheId = selectedCapability ? CAPABILITY_CACHES[selectedCapability] : undefined;
  const cache = cacheId ? state?.caches?.[cacheId] : undefined;
  const operation = componentId ? latestOperation(state?.operations ?? [], componentId) : undefined;
  const disabled = !state || Boolean(pendingAction) || state.stateReadOnly === true;

  return (
    <div
      aria-label={"Developer Tools"}
      style={{
        position: "relative",
        flex: 1,
        width: "100%",
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        overflow: "hidden",
      }}
    >
      <aside
        aria-label={"Developer tool list"}
        style={{
          width: isMobile ? "100%" : 210,
          maxHeight: isMobile ? "40vh" : undefined,
          borderRight: isMobile ? "none" : "1px solid var(--border)",
          borderBottom: isMobile ? "1px solid var(--border)" : "none",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "var(--bg-panel)",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
          {TOOL_CATEGORIES.map((category) => {
            const readyCount = category.capabilities.filter(
              (capability) => state?.capabilities[capability]?.health === "healthy",
            ).length;
            return (
              <div key={category.id} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "4px 8px 3px",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--text-dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  <span>{toolCategoryTitle(category.id)}</span>
                  <span style={{ letterSpacing: 0, fontWeight: 500 }}>
                    {state ? `${readyCount}/${category.capabilities.length}` : "–"}
                  </span>
                </div>
                {category.capabilities.map((capability) => {
                  const itemState = state?.capabilities[capability];
                  const selectedItem = selected === capability;
                  return (
                    <button
                      key={capability}
                      type="button"
                      data-tool-id={capability}
                      aria-label={`${CAPABILITY_LABELS[capability]} · ${healthLabel(itemState?.health ?? "missing")}`}
                      aria-current={selectedItem ? "true" : undefined}
                      onClick={() => setSelected(capability)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "8px 8px",
                        border: "none",
                        borderRadius: 5,
                        cursor: "pointer",
                        background: selectedItem ? "var(--bg-selected)" : "transparent",
                        color: "var(--text)",
                        textAlign: "left",
                      }}
                      onMouseEnter={(event) => {
                        if (!selectedItem) event.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(event) => {
                        if (!selectedItem) event.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          flexShrink: 0,
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: healthColor(itemState?.health ?? "missing"),
                        }}
                      />
                      <span
                        style={{
                          minWidth: 0,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          fontWeight: selectedItem ? 600 : 400,
                        }}
                      >
                        {CAPABILITY_LABELS[capability]}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ padding: "8px 8px 9px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <div
            role="status"
            aria-live="polite"
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 2px 7px", minWidth: 0 }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: !state ? "var(--warning)" : state.coreReady ? "var(--success)" : "var(--warning)",
                flexShrink: 0,
              }}
            />
            <span
              title={
                state?.lastScanAt
                  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                      new Date(state.lastScanAt),
                    )
                  : undefined
              }
              style={{
                minWidth: 0,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontSize: 10,
                color: "var(--text-dim)",
              }}
            >
              {!state
                ? "Scanning…"
                : state.coreReady
                  ? `${state.platform}-${state.arch} · r${state.revision}`
                  : "Tool discovery is starting…"}
            </span>
          </div>
          <ActionButton disabled={rescanPending} busy={rescanPending} onClick={onRescan} fullWidth>
            {rescanPending ? "Scanning…" : "Rescan"}
          </ActionButton>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: isMobile ? 16 : 20 }}>
        <ToolDetail
          capability={selectedCapability!}
          state={capabilityState}
          component={component}
          operation={operation}
          cacheId={cacheId}
          cache={cache}
          downloadsCache={state?.caches?.downloads}
          projectSummary={state?.projectSummary}
          stateReadOnly={state?.stateReadOnly === true}
          failed={failed}
          actionError={actionError}
          pendingAction={pendingAction}
          disabled={disabled}
          onAction={onAction}
        />
      </main>
    </div>
  );
}

function ToolDetail({
  capability,
  state,
  component,
  operation,
  cacheId,
  cache,
  downloadsCache,
  projectSummary,
  stateReadOnly,
  failed,
  actionError,
  pendingAction,
  disabled,
  onAction,
}: {
  capability: ToolCapabilityId;
  state?: PublicCapabilityState;
  component?: PublicManagedComponentState;
  operation?: PublicToolchainOperation;
  cacheId?: ToolchainCacheId;
  cache?: PublicToolchainCacheState;
  downloadsCache?: PublicToolchainCacheState;
  projectSummary?: string[];
  stateReadOnly: boolean;
  failed: boolean;
  actionError: string | null;
  pendingAction: string | null;
  disabled: boolean;
  onAction?: (request: ToolchainActionRequest) => void;
}) {
  const health = state?.health ?? "missing";
  const componentVisible = Boolean(
    component &&
    (component.sourceName || component.installed || component.canInstall || component.canRepair || component.canRemove),
  );
  const installKey = component ? `component:${component.componentId}:install` : "";
  const repairKey = component ? `component:${component.componentId}:repair` : "";
  const removeKey = component ? `component:${component.componentId}:remove` : "";
  const updateAvailable = Boolean(
    component?.installed && component.canInstall && component.activeVersion !== component.availableVersion,
  );
  const cancellable = Boolean(
    operation && ["queued", "downloading", "verifying", "extracting", "probing"].includes(operation.phase),
  );
  const operationVisible = Boolean(operation && (isActiveOperation(operation) || operation.phase === "error"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span
          style={{
            padding: "2px 6px",
            borderRadius: 3,
            flexShrink: 0,
            background: "rgba(120,120,120,0.12)",
            color: "var(--text-dim)",
            fontSize: 10,
          }}
        >
          {state?.provider ? providerLabel(state.provider) : "Not found"}
        </span>
        <code
          title={state?.pathLabel}
          style={{
            minWidth: 0,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}
        >
          {state?.pathLabel ?? "No executable selected"}
        </code>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            fontSize: 11,
            color: healthColor(health),
          }}
        >
          <span
            aria-hidden="true"
            style={{ width: 7, height: 7, borderRadius: "50%", background: healthColor(health) }}
          />
          {healthLabel(health)}
        </span>
      </div>

      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
          {CAPABILITY_LABELS[capability]}
        </div>
        <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)" }}>
          {
            "Choose which verified provider Pi Desktop should use for Skills, Plugins, Agent commands, and project operations."
          }
        </div>
      </div>

      {(failed || actionError) && (
        <div role="alert" style={{ color: "var(--danger)", fontSize: 12 }}>
          {actionError ?? "Tool discovery failed. Existing selections were not changed; try rescanning."}
        </div>
      )}
      {stateReadOnly && (
        <div role="alert" style={{ color: "var(--warning)", fontSize: 12 }}>
          {"These tool settings were written by a newer Pi Desktop. This version will not modify or delete them."}
        </div>
      )}

      <DetailSection title={"Tool resolution"}>
        <DetailGrid>
          <DetailPair label={"Status"} value={healthLabel(health)} valueColor={healthColor(health)} />
          <DetailPair label={"Provider"} value={state?.provider ? providerLabel(state.provider) : "Not found"} />
          <DetailPair label={"Version"} value={state?.version ? `v${state.version}` : "—"} mono />
          <DetailPair label={"Detected candidates"} value={`${state?.candidates.length ?? 0}`} />
        </DetailGrid>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label htmlFor={`tool-preference-${capability}`} style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {"Preference"}
          </label>
          <select
            id={`tool-preference-${capability}`}
            aria-label={`${CAPABILITY_LABELS[capability]} preference`}
            value={state?.preference ?? "auto"}
            disabled={disabled}
            onChange={(event) =>
              onAction?.({ action: "set-preference", capability, preference: event.target.value as ToolPreference })
            }
            style={{
              minHeight: 32,
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: 5,
              background: "var(--bg-panel)",
              color: "var(--text)",
              fontSize: 11,
            }}
          >
            {TOOL_PREFERENCES.map((preference) => (
              <option
                key={preference}
                value={preference}
                disabled={
                  preference === "custom" && !state?.candidates.some((candidate) => candidate.provider === "custom")
                }
              >
                {preferenceLabel(preference)}
              </option>
            ))}
          </select>
          <ActionButton disabled={disabled} onClick={() => onAction?.({ action: "choose-custom-tool", capability })}>
            {"Choose…"}
          </ActionButton>
        </div>
      </DetailSection>

      {state?.candidates.length ? (
        <DetailSection title={"Detected providers"}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" }}>
            {state.candidates.map((candidate, index) => (
              <div
                key={candidate.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "9px 11px",
                  borderBottom: index === state.candidates.length - 1 ? "none" : "1px solid var(--border)",
                  background: "var(--bg-panel)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: healthColor(candidate.health),
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                  {providerLabel(candidate.provider)}
                </span>
                <code
                  style={{
                    minWidth: 0,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 10,
                    color: "var(--text-dim)",
                  }}
                >
                  {candidate.pathLabel}
                </code>
                <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>
                  {candidate.version ? `v${candidate.version}` : healthLabel(candidate.health)}
                </span>
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {componentVisible && component && (
        <DetailSection title={"Managed runtime"}>
          <DetailGrid>
            <DetailPair label={"Component"} value={COMPONENT_LABELS[component.componentId]} />
            <DetailPair label={"Version"} value={component.activeVersion ? `v${component.activeVersion}` : "—"} mono />
            <DetailPair
              label={"Available version"}
              value={component.availableVersion ? `v${component.availableVersion}` : "—"}
              mono
            />
            <DetailPair label={"Platform"} value={component.platformArch ?? "—"} mono />
            <DetailPair label={"Download size"} value={formatBytes(component.downloadBytes)} />
            <DetailPair label={"Disk usage"} value={formatBytes(component.diskBytes)} />
            <DetailPair label={"Source"} value={component.sourceName ?? "Official source"} />
          </DetailGrid>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {component.canInstall && (
              <ActionButton
                primary
                disabled={disabled}
                busy={pendingAction === installKey}
                onClick={() => onAction?.({ action: "install-component", componentId: component.componentId })}
              >
                {updateAvailable ? "Update" : "Install"}
              </ActionButton>
            )}
            {component.canRepair && (
              <ActionButton
                disabled={disabled}
                busy={pendingAction === repairKey}
                onClick={() => onAction?.({ action: "repair-component", componentId: component.componentId })}
              >
                {"Repair"}
              </ActionButton>
            )}
            {component.canRemove && (
              <ActionButton
                disabled={disabled}
                busy={pendingAction === removeKey}
                onClick={() => onAction?.({ action: "remove-component", componentId: component.componentId })}
              >
                {"Remove"}
              </ActionButton>
            )}
            {component.licenseUrl && (
              <ActionButton onClick={() => void window.piBridge.openExternal(component.licenseUrl!)}>
                {"License"}
              </ActionButton>
            )}
            {cancellable && (
              <ActionButton
                onClick={() => onAction?.({ action: "cancel-component-install", componentId: component.componentId })}
              >
                {"Cancel"}
              </ActionButton>
            )}
          </div>
          {operationVisible && operation && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, color: operation.error ? "var(--danger)" : "var(--text-muted)" }}>
                {operationPhase(operation.phase)}
              </div>
              <OperationProgress operation={operation} />
            </div>
          )}
        </DetailSection>
      )}

      {(cache || downloadsCache) && (
        <DetailSection title={"Private storage"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cache && cacheId && (
              <CacheDetail
                cacheId={cacheId}
                cache={cache}
                disabled={disabled}
                busy={pendingAction === `cache:${cacheId}`}
                onAction={onAction}
              />
            )}
            {downloadsCache && cacheId !== "downloads" && (
              <CacheDetail
                cacheId="downloads"
                cache={downloadsCache}
                disabled={disabled}
                busy={pendingAction === "cache:downloads"}
                onAction={onAction}
              />
            )}
          </div>
        </DetailSection>
      )}

      {projectSummary?.length ? (
        <DetailSection title={"Current project"}>
          <div style={{ fontSize: 11, lineHeight: 1.65, color: "var(--text-muted)" }}>
            {projectSummary.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      <p style={{ margin: 0, paddingTop: 2, fontSize: 10, lineHeight: 1.65, color: "var(--text-dim)" }}>
        {
          "Scanning does not run shell profiles or access the network. Pi Desktop does not modify the system PATH, shell profile, or registry."
        }{" "}
        {
          "Managed installs contact the displayed official source and expose your IP address, platform, and architecture. Downloads stay inside Pi Desktop data."
        }
      </p>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
      {children}
    </section>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(100px, 132px) minmax(0, 1fr)",
        gap: "9px 14px",
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

function DetailPair({
  label,
  value,
  mono = false,
  valueColor = "var(--text-muted)",
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <>
      <div style={{ color: "var(--text-dim)" }}>{label}</div>
      <div
        style={{
          minWidth: 0,
          overflowWrap: "anywhere",
          color: valueColor,
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
      >
        {value}
      </div>
    </>
  );
}

function CacheDetail({
  cacheId,
  cache,
  disabled,
  busy,
  onAction,
}: {
  cacheId: ToolchainCacheId;
  cache: PublicToolchainCacheState;
  disabled: boolean;
  busy: boolean;
  onAction?: (request: ToolchainActionRequest) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 11px",
        border: "1px solid var(--border)",
        borderRadius: 7,
        background: "var(--bg-panel)",
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
          {CACHE_LABELS[cacheId]} {"cache"}
        </div>
        <div style={{ marginTop: 2, fontSize: 10, color: "var(--text-dim)" }}>{formatBytes(cache.diskBytes)}</div>
      </div>
      <ActionButton
        disabled={disabled || !cache.canClear}
        busy={busy}
        onClick={() => onAction?.({ action: "clear-cache", cacheId })}
      >
        {"Clear cache"}
      </ActionButton>
    </div>
  );
}

function OperationProgress({ operation }: { operation: PublicToolchainOperation }) {
  const percent =
    operation.totalBytes && operation.downloadedBytes !== undefined
      ? Math.min(100, Math.max(0, (operation.downloadedBytes / operation.totalBytes) * 100))
      : undefined;
  return (
    <div style={{ marginTop: 7 }}>
      {percent !== undefined && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          style={{ height: 4, borderRadius: 99, overflow: "hidden", background: "var(--border)" }}
        >
          <div style={{ width: `${percent}%`, height: "100%", background: "var(--accent)" }} />
        </div>
      )}
      {operation.totalBytes !== undefined && (
        <div style={{ marginTop: 4, fontSize: 9, color: "var(--text-dim)" }}>
          {formatBytes(operation.downloadedBytes)} / {formatBytes(operation.totalBytes)}
        </div>
      )}
      {operation.error && (
        <div role="alert" style={{ marginTop: 5, fontSize: 10, color: "var(--danger)" }}>
          {friendlyErrorCode(operation.error.code)}
        </div>
      )}
    </div>
  );
}

function isActiveOperation(operation: PublicToolchainOperation): boolean {
  return !["idle", "ready", "error", "cancelled"].includes(operation.phase);
}

function ActionButton({
  children,
  disabled = false,
  busy = false,
  primary = false,
  fullWidth = false,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
  fullWidth?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={onClick}
      style={{
        width: fullWidth ? "100%" : undefined,
        minHeight: 32,
        padding: "6px 11px",
        border: `1px solid ${primary ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 6,
        background: primary ? "var(--accent)" : "var(--bg)",
        color: primary ? "var(--on-accent)" : "var(--text)",
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : busy ? "wait" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {busy ? "…" : children}
    </button>
  );
}

function latestOperation(
  operations: readonly PublicToolchainOperation[],
  componentId: ManagedComponentId,
): PublicToolchainOperation | undefined {
  return [...operations].reverse().find((operation) => operation.componentId === componentId);
}

function actionKey(request: ToolchainActionRequest): string {
  switch (request.action) {
    case "rescan":
      return "rescan";
    case "install-profile":
      return `profile:${request.profileId}`;
    case "install-component":
      return `component:${request.componentId}:install`;
    case "repair-component":
      return `component:${request.componentId}:repair`;
    case "cancel-component-install":
      return `component:${request.componentId}:cancel`;
    case "remove-component":
      return `component:${request.componentId}:remove`;
    case "set-preference":
      return `preference:${request.capability}`;
    case "choose-custom-tool":
      return `custom:${request.capability}`;
    case "clear-cache":
      return `cache:${request.cacheId}`;
  }
}

function friendlyToolchainError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = message.match(/TOOLCHAIN_[A-Z_]+/)?.[0];
  if (code) return friendlyErrorCode(code);
  if (/ENOENT|not found|cannot find/i.test(message)) {
    return "A required developer tool is unavailable. Rescan or install the matching Essentials profile.";
  }
  return "The developer-tool action failed. Existing tools were not changed; try again or open logs.";
}

function friendlyErrorCode(code: string): string {
  if (code === "TOOLCHAIN_DOWNLOAD_OFFLINE")
    return "The official download source is unreachable. Check the network and retry.";
  if (code === "TOOLCHAIN_DOWNLOAD_REJECTED")
    return "The official download request or redirect was rejected. Retry, then open logs if it continues.";
  if (code === "TOOLCHAIN_INTEGRITY_FAILED")
    return "The downloaded file failed integrity verification and was discarded.";
  if (code === "TOOLCHAIN_EXTRACTION_FAILED") return "The verified archive could not be safely extracted.";
  if (code === "TOOLCHAIN_INSTALL_BUSY")
    return "This component is being installed or may still be used by a running Agent command. Retry when it is idle.";
  if (code === "TOOLCHAIN_PERMISSION_DENIED") return "Pi Desktop cannot write or execute its private tool directory.";
  if (code === "TOOLCHAIN_DISK_FULL") return "There is not enough disk space to install this developer tool.";
  if (code === "TOOLCHAIN_UNSUPPORTED")
    return "This managed tool is not available for the current platform and architecture.";
  if (code === "TOOLCHAIN_MODIFIED") return "The managed runtime was modified; repair it before use.";
  if (code === "TOOLCHAIN_INVALID_SELECTION")
    return "The selected executable did not provide the requested healthy tool.";
  if (code === "TOOLCHAIN_BROKEN") return "The downloaded tool could not pass its startup verification.";
  if (code === "TOOLCHAIN_INVALID_CATALOG")
    return "This application build does not contain a valid catalog entry for the tool.";
  if (code.endsWith("_REQUIRED") || code === "TOOLCHAIN_CAPABILITY_REQUIRED") {
    return "A required developer tool is unavailable. Rescan or install the matching Essentials profile.";
  }
  return "The developer-tool action failed. Existing tools were not changed; try again or open logs.";
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "Unknown";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** unit;
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function operationPhase(phase: PublicToolchainOperation["phase"]): string {
  const labels: Record<PublicToolchainOperation["phase"], string> = {
    idle: "Idle",
    queued: "Queued",
    downloading: "Downloading",
    verifying: "Verifying",
    extracting: "Extracting",
    probing: "Testing",
    activating: "Activating",
    ready: "Ready",
    error: "Failed",
    cancelled: "Cancelled",
  };
  return labels[phase];
}

function preferenceLabel(preference: ToolPreference): string {
  const labels: Record<ToolPreference, string> = {
    auto: "Auto",
    system: "System",
    bundled: "Bundled",
    managed: "Managed",
    custom: "Custom",
  };
  return labels[preference];
}

function providerLabel(provider: ToolProvider): string {
  const labels: Record<ToolProvider, string> = {
    project: "Project",
    custom: "Custom",
    system: "System",
    bundled: "Bundled",
    managed: "Managed",
    "legacy-upstream-managed": "Legacy",
  };
  return labels[provider];
}

function healthLabel(health: ToolHealth): string {
  const labels: Record<ToolHealth, string> = {
    healthy: "Ready",
    missing: "Missing",
    incomplete: "Incomplete",
    unsupported: "Unsupported",
    unverified: "Unverified",
    broken: "Broken",
    modified: "Modified",
    "blocked-by-trust": "Trust required",
  };
  return labels[health];
}

function healthColor(health: ToolHealth): string {
  if (health === "healthy") return "var(--success)";
  if (health === "missing") return "var(--text-dim)";
  if (health === "unverified" || health === "incomplete") return "var(--warning)";
  return "var(--danger)";
}
