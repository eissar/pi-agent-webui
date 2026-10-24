import { useEffect, useState } from "react";
import { reconnectNow } from "@/lib/api-client";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";

/** Small non-blocking toast shown while the backend socket is down. */
export function ConnectionStatusDialog() {
  const conn = useConnectionStatus();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (conn.status !== "reconnecting" || conn.nextRetryMs === 0) {
      setRemaining(0);
      return;
    }
    const until = Date.now() + conn.nextRetryMs;
    const tick = () => setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [conn.status, conn.attempt, conn.nextRetryMs]);

  if (conn.status === "connected") return null;
  const trying = conn.nextRetryMs === 0;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 10000,
        maxWidth: 320,
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--bg-panel)",
        color: "var(--text)",
        boxShadow: "0 8px 24px color-mix(in srgb, #000 20%, transparent)",
        fontSize: 13,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <strong style={{ fontSize: 13 }}>Disconnected from backend</strong>
      <span style={{ color: "var(--text-muted)" }}>
        {trying ? `Reconnecting… (attempt ${conn.attempt})` : `Retrying in ${remaining}s (attempt ${conn.attempt})`}
      </span>
      <span style={{ color: "var(--text-dim)", fontSize: 12 }}>Input is disabled; your draft is kept.</span>
      {!trying && (
        <button
          type="button"
          onClick={reconnectNow}
          style={{
            alignSelf: "flex-start",
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--user-bg)",
            color: "var(--user-fg)",
            cursor: "pointer",
          }}
        >
          Retry now
        </button>
      )}
    </div>
  );
}
