import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ModelsConfig } from "./ModelsConfig";
import { SkillsConfig, type SkillsConfigHandle } from "./SkillsConfig";
import { PluginsConfig } from "./PluginsConfig";
import type { ChatAppearancePreferences, ChatAssistantWidth, ChatFontSize, ChatLayout } from "@shared/chat-appearance";
import { APP_WEBSITE_URL } from "@shared/app-links";
import { openExternal } from "@/lib/web-platform";
import { APP_AUTHOR, APP_DISPLAY_NAME, APP_GITHUB_URL, APP_VERSION, PI_VERSION } from "@/lib/app-version";
import appIconUrl from "../../../build/icon.png";
import { isAutoSessionTitleEnabled, setAutoSessionTitleEnabled } from "../lib/auto-session-title";
import { getCacheWarmingStatus, setCacheWarmingMode } from "../lib/api-client";

export type SettingsTab = "general" | "models" | "skills" | "plugins" | "about";

interface SettingsConfigProps {
  cwd: string | null;
  sessionId: string | null;
  initialTab?: SettingsTab;
  onClose: () => void;
  onModelsChanged: () => void;
  onPluginsReloaded: () => void;
  chatAppearance: ChatAppearancePreferences;
  chatAppearanceSaving: boolean;
  onChatAppearanceChange: (preferences: ChatAppearancePreferences) => Promise<void>;
}

export function SettingsConfig({
  cwd,
  sessionId,
  initialTab = "general",
  onClose,
  onModelsChanged,
  onPluginsReloaded,
  chatAppearance,
  chatAppearanceSaving,
  onChatAppearanceChange,
}: SettingsConfigProps) {
  const isMobile = useIsMobile();
  const { isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const skillsConfigRef = useRef<SkillsConfigHandle>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  const requestSettingsTransition = useCallback((action: () => void) => {
    if (activeTabRef.current === "skills" && skillsConfigRef.current) {
      skillsConfigRef.current.requestLeave(action);
      return;
    }
    action();
  }, []);

  useEffect(() => {
    if (initialTab !== activeTabRef.current) requestSettingsTransition(() => setActiveTab(initialTab));
  }, [initialTab, requestSettingsTransition]);

  useEffect(() => {
    const returnFocus = returnFocusRef.current;
    closeButtonRef.current?.focus();
    return () => {
      returnFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      document.getElementById(`settings-tab-${activeTab}`)?.focus();
    }
  }, [activeTab]);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "models", label: "Models" },
    { id: "skills", label: "Skills" },
    { id: "plugins", label: "Plugins" },
    { id: "about", label: "About" },
  ];

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestSettingsTransition(onClose);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={"Settings"}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            requestSettingsTransition(onClose);
            return;
          }
          if (event.key !== "Tab") return;

          const dialog = dialogRef.current;
          if (!dialog) return;
          const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          if (focusable.length === 0) {
            event.preventDefault();
            dialog.focus();
            return;
          }

          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        tabIndex={-1}
        style={{
          width: isMobile ? "calc(100vw - 16px)" : 960,
          maxWidth: "calc(100vw - 16px)",
          height: isMobile ? "calc(100dvh - 16px)" : "82vh",
          maxHeight: "calc(100dvh - 16px)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "13px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{"Settings"}</div>
            {!isMobile && (
              <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-dim)" }}>
                {"Manage app preferences, models, skills, and plugins."}
              </div>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => requestSettingsTransition(onClose)}
            aria-label={"Close"}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              width: 36,
              height: 36,
              padding: 0,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", overflow: "hidden" }}>
          <div
            role="tablist"
            aria-label={"Settings"}
            aria-orientation="vertical"
            style={{
              width: isMobile ? 112 : 168,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: isMobile ? "10px 8px" : "12px 10px",
              borderRight: "1px solid var(--border)",
              overflowY: "auto",
              flexShrink: 0,
              background: "var(--bg-panel)",
            }}
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  id={`settings-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="settings-tabpanel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => {
                    if (!active) requestSettingsTransition(() => setActiveTab(tab.id));
                  }}
                  onKeyDown={(event) => {
                    const currentIndex = tabs.findIndex((item) => item.id === tab.id);
                    let nextIndex: number | undefined;
                    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % tabs.length;
                    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                    if (event.key === "Home") nextIndex = 0;
                    if (event.key === "End") nextIndex = tabs.length - 1;
                    if (nextIndex === undefined) return;
                    event.preventDefault();
                    const nextTab = tabs[nextIndex];
                    requestSettingsTransition(() => {
                      setActiveTab(nextTab.id);
                      document.getElementById(`settings-tab-${nextTab.id}`)?.focus();
                    });
                  }}
                  style={{
                    position: "relative",
                    width: "100%",
                    minHeight: 40,
                    padding: isMobile ? "8px 10px" : "8px 12px",
                    border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
                    borderRadius: 7,
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    fontSize: 12,
                    lineHeight: 1.35,
                    fontWeight: active ? 650 : 500,
                    textAlign: "left",
                    cursor: "pointer",
                    overflowWrap: "anywhere",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div
            id="settings-tabpanel"
            role="tabpanel"
            aria-labelledby={`settings-tab-${activeTab}`}
            style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", display: "flex" }}
          >
            {activeTab === "general" && (
              <GeneralSettings
                isDark={isDark}
                onThemeChange={(nextDark) => {
                  if (nextDark !== isDark) toggleTheme();
                }}
                chatAppearance={chatAppearance}
                chatAppearanceSaving={chatAppearanceSaving}
                onChatAppearanceChange={onChatAppearanceChange}
              />
            )}
            {activeTab === "models" && (
              <ModelsConfig embedded cwd={cwd} onClose={() => undefined} onChanged={onModelsChanged} />
            )}
            {activeTab === "skills" &&
              (cwd ? (
                <SkillsConfig ref={skillsConfigRef} embedded cwd={cwd} onClose={() => undefined} />
              ) : (
                <ProjectRequired />
              ))}
            {activeTab === "plugins" &&
              (cwd ? (
                <PluginsConfig
                  embedded
                  cwd={cwd}
                  sessionId={sessionId}
                  onClose={() => undefined}
                  onReloaded={onPluginsReloaded}
                />
              ) : (
                <ProjectRequired />
              ))}
            {activeTab === "about" && <AboutSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutSettings() {
  return (
    <div
      style={{
        width: "100%",
        overflowY: "auto",
        padding: "28px clamp(18px, 5vw, 52px)",
        display: "flex",
      }}
    >
      <div style={{ width: "100%", maxWidth: 620, margin: "auto" }}>
        <section
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            paddingBottom: 26,
          }}
        >
          <img
            aria-hidden="true"
            src={appIconUrl}
            alt=""
            style={{
              width: 64,
              height: 64,
              objectFit: "contain",
              flexShrink: 0,
              filter: "drop-shadow(0 4px 10px color-mix(in srgb, #000 12%, transparent))",
            }}
          />
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "var(--text)" }}>{APP_DISPLAY_NAME}</h2>
            <p style={{ margin: "5px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--text-dim)" }}>
              {"App, Pi, and project information."}
            </p>
          </div>
        </section>

        <section>
          <h2 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text)" }}>{"Application information"}</h2>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-panel)",
              overflow: "hidden",
            }}
          >
            <AboutRow label={"Software version"} value={`v${APP_VERSION}`} />
            <AboutRow label={"Pi version"} value={`v${PI_VERSION}`} />
            <AboutRow label={"Author"} value={APP_AUTHOR} />
            <AboutRow
              label={"Official website"}
              value={
                <button
                  type="button"
                  title={"Open official website"}
                  onClick={() => openExternal(APP_WEBSITE_URL)}
                  style={{
                    maxWidth: "100%",
                    padding: 0,
                    border: 0,
                    background: "none",
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    cursor: "pointer",
                    overflowWrap: "anywhere",
                    textAlign: "right",
                  }}
                >
                  pi-desktop.app ↗
                </button>
              }
            />
            <AboutRow
              label={"GitHub repository"}
              value={
                <button
                  type="button"
                  title={"Open GitHub repository"}
                  onClick={() => openExternal(APP_GITHUB_URL)}
                  style={{
                    maxWidth: "100%",
                    padding: 0,
                    border: 0,
                    background: "none",
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    cursor: "pointer",
                    overflowWrap: "anywhere",
                    textAlign: "right",
                  }}
                >
                  github.com/DLYZZT/pi-desktop ↗
                </button>
              }
              last
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function AboutRow({ label, value, last = false }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        minHeight: 52,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        borderBottom: last ? "none" : "1px solid var(--border)",
      }}
    >
      <span style={{ flexShrink: 0, fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
      <span
        style={{
          minWidth: 0,
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function GeneralSettings({
  isDark,
  onThemeChange,
  chatAppearance,
  chatAppearanceSaving,
  onChatAppearanceChange,
}: {
  isDark: boolean;
  onThemeChange: (dark: boolean) => void;
  chatAppearance: ChatAppearancePreferences;
  chatAppearanceSaving: boolean;
  onChatAppearanceChange: (preferences: ChatAppearancePreferences) => Promise<void>;
}) {
  const [autoSessionTitle, setAutoSessionTitle] = useState(() => isAutoSessionTitleEnabled());
  const [cacheWarmingMode, setCacheWarmingModeState] = useState<"off" | "streaming" | "idle">("streaming");
  const [cacheWarmingLoading, setCacheWarmingLoading] = useState(true);
  const [cacheWarmingSaving, setCacheWarmingSaving] = useState(false);
  const [cacheWarmingError, setCacheWarmingError] = useState<"load" | "save" | "partial" | null>(null);
  const [chatAppearanceError, setChatAppearanceError] = useState(false);
  const autoSessionTitleControlId = useId();
  const cacheWarmingControlId = useId();
  const chatFontSizeControlId = useId();
  const chatLayoutControlId = useId();
  const chatAssistantWidthControlId = useId();
  const themeControlId = useId();
  useEffect(() => {
    let disposed = false;
    void getCacheWarmingStatus()
      .then((status) => {
        if (disposed) return;
        setCacheWarmingModeState(status.mode);
        setCacheWarmingError(status.loadFailed ? "load" : null);
      })
      .catch(() => {
        if (!disposed) setCacheWarmingError("load");
      })
      .finally(() => {
        if (!disposed) setCacheWarmingLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const saveChatAppearance = async (next: ChatAppearancePreferences): Promise<void> => {
    setChatAppearanceError(false);
    try {
      await onChatAppearanceChange(next);
    } catch {
      setChatAppearanceError(true);
    }
  };
  const saveCacheWarming = async (next: "off" | "streaming" | "idle"): Promise<void> => {
    const previous = cacheWarmingMode;
    setCacheWarmingSaving(true);
    setCacheWarmingError(null);
    try {
      const result = await setCacheWarmingMode(next);
      setCacheWarmingModeState(result.mode);
      setCacheWarmingError(result.pendingSessionCount > 0 ? "partial" : null);
    } catch {
      try {
        const status = await getCacheWarmingStatus();
        setCacheWarmingModeState(status.mode);
        setCacheWarmingError(status.loadFailed ? "load" : "save");
      } catch {
        setCacheWarmingModeState(previous);
        setCacheWarmingError("save");
      }
    } finally {
      setCacheWarmingSaving(false);
    }
  };
  return (
    <div style={{ width: "100%", overflowY: "auto", padding: "28px clamp(18px, 5vw, 52px)" }}>
      <section style={{ maxWidth: 620 }}>
        <h2 style={{ margin: 0, fontSize: 14, color: "var(--text)" }}>{"Conversation"}</h2>
        <p style={{ margin: "6px 0 16px", fontSize: 12, lineHeight: 1.6, color: "var(--text-dim)" }}>
          {"Control automatic titles, chat text size, and the conversation reading width."}
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <SettingRow label={"Auto-title new sessions"} controlId={autoSessionTitleControlId}>
            <label
              htmlFor={autoSessionTitleControlId}
              style={{
                width: 36,
                height: 36,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <input
                id={autoSessionTitleControlId}
                type="checkbox"
                checked={autoSessionTitle}
                onChange={(event) => {
                  const next = event.target.checked;
                  setAutoSessionTitle(next);
                  setAutoSessionTitleEnabled(next);
                }}
                style={{
                  width: 18,
                  height: 18,
                  margin: 0,
                  accentColor: "var(--accent)",
                  cursor: "pointer",
                }}
              />
            </label>
          </SettingRow>
          <SettingRow label={"Prompt cache warming"} controlId={cacheWarmingControlId}>
            <select
              id={cacheWarmingControlId}
              value={cacheWarmingMode}
              disabled={cacheWarmingLoading || cacheWarmingSaving || cacheWarmingError === "load"}
              onChange={(event) => {
                void saveCacheWarming(event.target.value as "off" | "streaming" | "idle");
              }}
              style={{ ...selectStyle, cursor: cacheWarmingSaving ? "wait" : "pointer" }}
            >
              <option value="off">{"Off"}</option>
              <option value="streaming">{"During long tool runs"}</option>
              <option value="idle">{"Also while idle"}</option>
            </select>
          </SettingRow>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "var(--text-dim)" }}>
            {"Cache warming may use model tokens. This setting is shared with the Pi CLI."}
          </p>
          {cacheWarmingError && (
            <p role="alert" style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "var(--danger)" }}>
              {cacheWarmingError === "load"
                ? "The Pi cache warming setting could not be read."
                : cacheWarmingError === "partial"
                  ? "Saved, but some active sessions could not update. Reopen those sessions."
                  : "The Pi cache warming setting could not be saved."}
            </p>
          )}
          <SettingRow label={"Chat text size"} controlId={chatFontSizeControlId}>
            <select
              id={chatFontSizeControlId}
              value={chatAppearance.fontSize}
              disabled={chatAppearanceSaving}
              onChange={(event) => {
                void saveChatAppearance({
                  ...chatAppearance,
                  fontSize: event.target.value as ChatFontSize,
                });
              }}
              style={{ ...selectStyle, cursor: chatAppearanceSaving ? "wait" : "pointer" }}
            >
              <option value="small">{"Small"}</option>
              <option value="standard">{"Standard"}</option>
              <option value="large">{"Large"}</option>
              <option value="extra-large">{"Extra large"}</option>
            </select>
          </SettingRow>
          <SettingRow label={"Conversation width"} controlId={chatLayoutControlId}>
            <select
              id={chatLayoutControlId}
              value={chatAppearance.layout}
              disabled={chatAppearanceSaving}
              onChange={(event) => {
                void saveChatAppearance({
                  ...chatAppearance,
                  layout: event.target.value as ChatLayout,
                });
              }}
              style={{ ...selectStyle, cursor: chatAppearanceSaving ? "wait" : "pointer" }}
            >
              <option value="fixed">{"Comfortable width"}</option>
              <option value="wide">{"Expanded width"}</option>
            </select>
          </SettingRow>
          <SettingRow label={"Model reply width"} controlId={chatAssistantWidthControlId}>
            <select
              id={chatAssistantWidthControlId}
              value={chatAppearance.assistantWidth ?? "comfortable"}
              disabled={chatAppearanceSaving}
              onChange={(event) => {
                void saveChatAppearance({
                  ...chatAppearance,
                  assistantWidth: event.target.value as ChatAssistantWidth,
                });
              }}
              style={{ ...selectStyle, cursor: chatAppearanceSaving ? "wait" : "pointer" }}
            >
              <option value="comfortable">{"Comfortable width"}</option>
              <option value="full">{"Fill conversation column"}</option>
            </select>
          </SettingRow>
        </div>
        {chatAppearanceError && (
          <p role="alert" style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--danger)" }}>
            {"Chat appearance could not be saved. The previous settings were restored."}
          </p>
        )}
      </section>

      <div style={{ height: 1, background: "var(--border)", maxWidth: 620, margin: "28px 0" }} />

      <section style={{ maxWidth: 620 }}>
        <h2 style={{ margin: 0, fontSize: 14, color: "var(--text)" }}>{"Appearance"}</h2>
        <p style={{ margin: "6px 0 16px", fontSize: 12, lineHeight: 1.6, color: "var(--text-dim)" }}>
          {"Choose the color mode used by the app."}
        </p>
        <SettingRow label={"Theme"} controlId={themeControlId}>
          <select
            id={themeControlId}
            value={isDark ? "dark" : "light"}
            onChange={(event) => onThemeChange(event.target.value === "dark")}
            style={selectStyle}
          >
            <option value="light">{"Light"}</option>
            <option value="dark">{"Dark"}</option>
          </select>
        </SettingRow>
      </section>
    </div>
  );
}

function SettingRow({ label, controlId, children }: { label: string; controlId: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        minHeight: 52,
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-panel)",
      }}
    >
      <label htmlFor={controlId} style={{ fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ProjectRequired() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 380 }}>
        <div style={{ fontSize: 14, fontWeight: 650, color: "var(--text)" }}>{"Select a project first"}</div>
        <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.6, color: "var(--text-dim)" }}>
          {"Skills and plugins depend on the current project. Select a project directory from the sidebar first."}
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  minWidth: 160,
  minHeight: 36,
  padding: "7px 30px 7px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
};
