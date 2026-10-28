import { useSessionList } from "@/hooks/useSessionList";
import { useState, useCallback, useRef, useEffect } from "react";
import { SessionSidebar } from "./SessionSidebar";
import { ChatWindow } from "./ChatWindow";
import { SessionInfoPanel } from "./SessionInfoPanel";
import { SessionPresentationStore } from "@/lib/session-presentation-store";
import { SettingsConfig, type SettingsTab } from "./SettingsConfig";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getSessionDisplayTitle } from "@/lib/session-list";
import { beginSessionLoadTrace } from "@/lib/session-performance";
import { readSessionIdFromSearch, routerCompat } from "@/lib/router-compat";
import { SessionProfiler } from "./SessionProfiler";
import { ThinkingExpansionRegistry } from "@/lib/thinking-expansion-store";
import type { SessionInfo } from "@/lib/types";
import type { ChatInputHandle } from "./ChatInput";
import type { ChatAppearancePreferences } from "@shared/chat-appearance";
import { worktreePathsEqual } from "@shared/worktree-path";

export function AppShell({
  chatAppearance,
  chatAppearanceSaving,
  onChatAppearanceChange,
}: {
  chatAppearance: ChatAppearancePreferences;
  chatAppearanceSaving: boolean;
  onChatAppearanceChange: (preferences: ChatAppearancePreferences) => Promise<void>;
}) {
  const router = routerCompat;
  const { isDark, toggleTheme } = useTheme();
  const sessionList = useSessionList();
  const isMobile = useIsMobile();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [presentationStore] = useState(() => new SessionPresentationStore());
  const presentation = presentationStore.presentationSignal.value;
  const displayedSession =
    presentation?.sessionId === selectedSession?.id ? (presentation?.info ?? selectedSession) : selectedSession;

  // When user clicks +, we only store the cwd — no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [worktreesRefreshKey, setWorktreesRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("general");
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarReady, setMobileSidebarReady] = useState(false);

  // On mobile the sidebar is an overlay drawer; hide it by default so the chat
  // is visible on load. Runs once the breakpoint resolves after hydration.
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);
  useEffect(() => {
    setMobileSidebarReady(true);
  }, []);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const thinkingExpansionRegistryRef = useRef(new ThinkingExpansionRegistry());
  const processDetailsExpansionRegistryRef = useRef(new ThinkingExpansionRegistry());

  const [activeTopPanel, setActiveTopPanel] = useState<"session" | null>(null);

  const toggleTopPanel = useCallback(() => {
    if (isMobile) setSidebarOpen(false);
    setActiveTopPanel((cur) => (cur === "session" ? null : "session"));
  }, [isMobile]);

  const openSessionStatsPanel = useCallback(() => {
    if (isMobile) setSidebarOpen(false);
    setActiveTopPanel("session");
  }, [isMobile]);

  const handleSidebarToggle = useCallback(() => {
    if (isMobile) setActiveTopPanel(null);
    setSidebarOpen((open) => !open);
  }, [isMobile]);

  const [initialSessionId] = useState<string | null>(() => readSessionIdFromSearch(window.location.search));
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !initialSessionId);
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);

  const handleCwdChange = useCallback(
    (cwd: string | null, projectRoot?: string | null) => {
      setActiveCwd(cwd);
      // Skip if cwd is null (initial mount) or during the initial URL restore.
      if (!cwd) return;
      if (suppressCwdBumpRef.current) {
        suppressCwdBumpRef.current = false;
        return;
      }
      // Worktrees of one repo share a project root. Moving the effective cwd
      // within the same project (e.g. switching worktree, or clicking a session
      // that lives in another worktree) must not close the open session.
      // Path strings may differ in separators/casing depending on their source
      // (session file vs git output), so compare with worktreePathsEqual.
      const newProject = projectRoot ?? cwd;
      if (selectedSession && worktreePathsEqual(selectedSession.projectRoot ?? selectedSession.cwd, newProject)) {
        return;
      }
      // Close any session that belongs to a different project — it no longer
      // matches the selected project directory.
      setSelectedSession(null);
      setNewSessionCwd((prev) => {
        if (prev && prev !== cwd) return null;
        return prev;
      });
      setSessionKey((k) => k + 1);
      setActiveTopPanel(null);
      router.replace("/", { scroll: false });
    },
    [router, selectedSession],
  );

  const handleSelectSession = useCallback(
    (session: SessionInfo, isRestore = false) => {
      beginSessionLoadTrace(session.id, isRestore ? "restore" : "selection");
      setNewSessionCwd(null);
      setSelectedSession(session);
      setSessionKey((k) => k + 1);
      setInitialSessionRestored(true);
      // On mobile, collapse the overlay drawer so the chat is revealed after pick.
      if (isMobile && !isRestore) setSidebarOpen(false);
      if (isRestore) {
        // Suppress the redundant sessionKey bump that would come from the
        // onCwdChange effect firing after setSelectedCwd in the sidebar
        suppressCwdBumpRef.current = true;
      }
      // Skip router.replace when restoring from URL — the param is already correct
      // and replacing it during the initial desktop restore causes a remount loop
      if (!isRestore) {
        router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
      }
    },
    [router, isMobile],
  );

  const handleNewSession = useCallback(
    (_sessionId: string, cwd: string) => {
      setSelectedSession(null);
      setNewSessionCwd(cwd);
      setSessionKey((k) => k + 1);
      setActiveTopPanel(null);
      if (isMobile) setSidebarOpen(false);
      router.replace("/", { scroll: false });
    },
    [router, isMobile],
  );

  const hydrateSelectedSession = useCallback(
    (sessionId: string) => {
      void sessionList
        .findSession(sessionId)
        .then((full) => {
          if (!full) return;
          setSelectedSession((prev) => (prev && prev.id === sessionId && !prev.projectRoot ? full : prev));
        })
        .catch(() => {});
    },
    [sessionList],
  );

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback(
    (session: SessionInfo) => {
      setNewSessionCwd(null);
      setSelectedSession(session);
      sessionList.ensureIndexed(session.id);
      hydrateSelectedSession(session.id);
      router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
    },
    [router, hydrateSelectedSession, sessionList],
  );

  const handleAgentEnd = useCallback(() => {
    if (selectedSession?.id) sessionList.ensureIndexed(selectedSession.id);
    sessionList.refreshIfDisconnected();
    setWorktreesRefreshKey((k) => k + 1);
  }, [sessionList, selectedSession?.id]);

  const handleSessionForked = useCallback(
    (newSessionId: string) => {
      setSessionKey((k) => k + 1);
      setNewSessionCwd(null);
      setSelectedSession((prev) => ({
        ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
        id: newSessionId,
      }));
      hydrateSelectedSession(newSessionId);
      router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
    },
    [router, hydrateSelectedSession],
  );

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleSessionDeleted = useCallback(
    (sessionId: string) => {
      thinkingExpansionRegistryRef.current.delete(sessionId);
      processDetailsExpansionRegistryRef.current.delete(sessionId);
      if (selectedSession?.id === sessionId) {
        const cwd = selectedSession.cwd;
        setSelectedSession(null);
        setNewSessionCwd(cwd ?? null);
        setSessionKey((k) => k + 1);
        setActiveTopPanel(null);
        router.replace("/", { scroll: false });
      }
    },
    [selectedSession, router],
  );

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
  const showChat = selectedSession !== null || effectiveNewSessionCwd !== null;
  // While restoring initial session from URL, don't show the placeholder
  const showPlaceholder = initialSessionRestored && !showChat;

  const sidebarContent = (
    <>
      <SessionSidebar
        selectedSessionId={selectedSession?.id ?? null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        initialSessionId={initialSessionId}
        onInitialRestoreDone={handleInitialRestoreDone}
        sessionList={sessionList}
        worktreesRefreshKey={worktreesRefreshKey}
        onSessionDeleted={handleSessionDeleted}
        selectedCwd={selectedSession?.cwd ?? newSessionCwd ?? null}
        onCwdChange={handleCwdChange}
      />
      <div style={{ padding: "8px", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={"Settings"}
          style={{
            width: "100%",
            height: 34,
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            background: "none",
            border: "none",
            borderRadius: 9,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 12,
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.38.33.72.6 1 .3.29.69.42 1.1.4h.09v4h-.09a1.7 1.7 0 0 0-1.7.6Z" />
          </svg>
          {"Settings"}
        </button>
      </div>
    </>
  );

  return (
    <>
      <style>{`
      @keyframes session-info-pop {
        0% {
          opacity: 0;
          transform: translateY(-24px);
          filter: blur(6px);
          box-shadow: 0 2px 8px rgba(0,0,0,0);
        }
        55% {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
          background: color-mix(in srgb, var(--accent) 8%, var(--bg-panel));
          box-shadow: 0 18px 44px color-mix(in srgb, var(--accent) 18%, transparent);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
          background: var(--bg-panel);
          box-shadow: 0 10px 28px rgba(0,0,0,0.10);
        }
      }
      @keyframes session-info-light-wash {
        0% {
          opacity: 0;
          transform: translateX(-110%) skewX(-16deg);
        }
        24% {
          opacity: 0.42;
        }
        100% {
          opacity: 0;
          transform: translateX(115%) skewX(-16deg);
        }
      }
      .session-info-popover {
        position: relative;
        overflow: hidden;
        transform-origin: top right;
        animation: session-info-pop 360ms ease-out both;
        will-change: transform, opacity, filter, background, box-shadow;
      }
      .session-info-popover::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 44%;
        pointer-events: none;
        background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 24%, transparent), transparent);
        animation: session-info-light-wash 620ms ease-out both;
      }
      @media (prefers-reduced-motion: reduce) {
        .session-info-popover,
        .session-info-popover::after {
          animation: none;
        }
      }
      @media (max-width: 640px) {
        .sidebar-overlay-backdrop.sidebar-mobile-pending {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        .sidebar-container.sidebar-mobile-pending.sidebar-open {
          transform: translateX(-100%);
          box-shadow: none;
        }
      }
    `}</style>
      <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "var(--bg)" }}>
        {/* Mobile overlay backdrop */}
        <div
          className={`sidebar-overlay-backdrop${mobileSidebarReady ? "" : " sidebar-mobile-pending"}`}
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 199,
            background: "rgba(0,0,0,0.4)",
            opacity: sidebarOpen ? 1 : 0,
            pointerEvents: sidebarOpen ? "auto" : "none",
            transition: "opacity 0.25s ease",
          }}
        />

        {/* Left sidebar */}
        <div
          className={`sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"}${mobileSidebarReady ? "" : " sidebar-mobile-pending"}`}
          style={{
            background: "var(--bg-panel)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            zIndex: 200,
          }}
        >
          {sidebarContent}
        </div>

        {/* Center: chat */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minWidth: 0,
            position: "relative",
          }}
        >
          {/* Top bar with sidebar toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              borderBottom: "1px solid var(--border)",
              height: 44,
              background: "var(--bg-panel)",
              position: "relative",
              zIndex: 2,
            }}
          >
            <button
              onClick={handleSidebarToggle}
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                padding: 0,
                background: "none",
                border: "none",
                borderRight: "1px solid var(--border)",
                color: "var(--text-muted)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "color 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              {sidebarOpen ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
              }}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={isDark}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                padding: 0,
                background: "none",
                border: "none",
                borderRight: "1px solid var(--border)",
                color: "var(--text-muted)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "color 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              {isDark ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            {selectedSession && !isMobile && (
              <div
                role="heading"
                aria-level={1}
                title={getSessionDisplayTitle(displayedSession ?? selectedSession, 240)}
                style={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  padding: "0 12px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text)",
                  fontSize: 13,
                  fontWeight: 650,
                }}
              >
                {getSessionDisplayTitle(displayedSession ?? selectedSession)}
              </div>
            )}
            <SessionInfoPanel
              store={presentationStore}
              showChat={showChat}
              activeTopPanel={activeTopPanel}
              toggleTopPanel={toggleTopPanel}
              isMobile={isMobile}
            />
          </div>

          {/* Chat content */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {showChat ? (
              <SessionProfiler key={sessionKey} id="ChatWindow">
                <ChatWindow
                  session={selectedSession}
                  newSessionCwd={effectiveNewSessionCwd}
                  onAgentEnd={handleAgentEnd}
                  onSessionCreated={handleSessionCreated}
                  onSessionForked={handleSessionForked}
                  modelsRefreshKey={modelsRefreshKey}
                  chatInputRef={chatInputRef}
                  presentationStore={presentationStore}
                  onSessionStatsPanelOpen={openSessionStatsPanel}
                  thinkingExpansionStore={thinkingExpansionRegistryRef.current.get(
                    selectedSession?.id ?? `new:${effectiveNewSessionCwd ?? "untitled"}`,
                  )}
                  processDetailsExpansionStore={processDetailsExpansionRegistryRef.current.get(
                    selectedSession?.id ?? `new:${effectiveNewSessionCwd ?? "untitled"}`,
                  )}
                />
              </SessionProfiler>
            ) : showPlaceholder ? (
              activeCwd ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    fontSize: 15,
                  }}
                >
                  {"Select a session from the sidebar"}
                </div>
              ) : (
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                >
                  <svg
                    width="44"
                    height="44"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: 0.7, flexShrink: 0 }}
                  >
                    <line x1="20" y1="12" x2="4" y2="12" />
                    <polyline points="10 6 4 12 10 18" />
                  </svg>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                      {"Get Started"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                      <span style={{ color: "var(--text-dim)", marginRight: 6 }}>1.</span>
                      {"Select a project directory from the sidebar"}
                      <br />
                      <span style={{ color: "var(--text-dim)", marginRight: 6 }}>2.</span>
                      {"Open Settings at the bottom, then add models"}
                    </div>
                  </div>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
      {settingsOpen && (
        <SettingsConfig
          cwd={activeCwd ?? selectedSession?.cwd ?? newSessionCwd ?? null}
          sessionId={selectedSession?.id ?? null}
          initialTab={settingsInitialTab}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsInitialTab("general");
          }}
          onModelsChanged={() => setModelsRefreshKey((key) => key + 1)}
          onPluginsReloaded={() => setSessionKey((key) => key + 1)}
          chatAppearance={chatAppearance}
          chatAppearanceSaving={chatAppearanceSaving}
          onChatAppearanceChange={onChatAppearanceChange}
        />
      )}
    </>
  );
}
