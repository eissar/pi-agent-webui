import { Component, type CSSProperties, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ensureRpc, resetRpc } from "@/lib/api-client";
import { NotificationHost } from "@/components/NotificationHost";
import { ConnectionStatusDialog } from "@/components/ConnectionStatusDialog";
import { useChatAppearance } from "@/hooks/useChatAppearance";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[pi-webui] render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={centerStyle}>
          <div style={cardStyle}>
            <h1 style={titleStyle}>UI crashed</h1>
            <p style={bodyStyle}>{this.state.error.message}</p>
            <pre style={preStyle}>{this.state.error.stack}</pre>
            <button type="button" onClick={() => window.location.reload()} style={btnPrimary}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const chatAppearance = useChatAppearance();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting to backend…");

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      setStatus("Establishing RPC connection…");
      ensureRpc()
        .then(() => {
          if (!cancelled) {
            setReady(true);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error("[pi-webui] connection failed:", err);
            setError(err instanceof Error ? err.message : String(err));
            setReady(false);
          }
        });
    };

    connect();

    const offRestart = window.piBridge?.onHostRestarted?.((payload) => {
      console.warn("[pi-webui] host restarted:", payload.reason);
      resetRpc();
      setReady(false);
      setStatus("Backend restarted — reconnecting…");
      setError(null);
      connect();
    });

    const offCrash = window.piBridge?.onHostCrashed?.((payload) => {
      resetRpc();
      setReady(false);
      setError(payload.detail || "Backend crashed and could not recover");
    });

    return () => {
      cancelled = true;
      offRestart?.();
      offCrash?.();
    };
  }, []);

  if (error) {
    return (
      <div style={centerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Cannot connect to Backend</h1>
          <p style={bodyStyle}>{error}</p>
          <button type="button" onClick={() => window.location.reload()} style={btnPrimary}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={centerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8 }}>{status}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Pi Agent WebUI</div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell
        chatAppearance={chatAppearance.preferences}
        chatAppearanceSaving={chatAppearance.saving}
        onChatAppearanceChange={chatAppearance.update}
      />
      <ConnectionStatusDialog />
      <NotificationHost />
    </ErrorBoundary>
  );
}

const centerStyle: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 32,
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "var(--font-sans)",
};

const cardStyle: CSSProperties = {
  maxWidth: 520,
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "28px 32px",
};

const titleStyle: CSSProperties = {
  fontSize: 18,
  margin: "0 0 12px",
  fontFamily: "var(--font-mono)",
};

const bodyStyle: CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.55,
  color: "var(--text-muted)",
  margin: "0 0 8px",
};

const preStyle: CSSProperties = {
  fontSize: 11,
  overflow: "auto",
  maxHeight: 200,
  background: "var(--tool-bg)",
  color: "var(--tool-fg)",
  border: "1px solid var(--tool-border)",
  fontFamily: "var(--font-mono)",
  padding: 12,
  borderRadius: 8,
};

const btnPrimary: CSSProperties = {
  marginTop: 16,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--user-bg)",
  color: "var(--user-fg)",
  cursor: "pointer",
};
