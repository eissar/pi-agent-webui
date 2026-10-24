import { useSyncExternalStore } from "react";
import { getNotificationsSnapshot, subscribeNotifications } from "@/lib/notifications";

const COLORS = { error: "#ef4444", warning: "#d97706", success: "#10b981", info: "var(--accent)" } as const;

/** Renders global notifications (`notify.*`) as a stack in the top-right corner. */
export function NotificationHost() {
  const items = useSyncExternalStore(subscribeNotifications, getNotificationsSnapshot, getNotificationsSnapshot);
  if (items.length === 0) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 10001,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
        pointerEvents: "none",
        maxWidth: "min(92vw, 420px)",
      }}
    >
      {items.map((n) => (
        <div
          key={n.id}
          role={n.type === "error" ? "alert" : "status"}
          className="notice-shelf-item"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            borderLeft: `3px solid ${COLORS[n.type]}`,
            background: "var(--bg-panel)",
            color: "var(--text)",
            fontSize: 13,
            lineHeight: 1.45,
            boxShadow: "0 8px 24px -12px rgba(15,23,42,0.3)",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
            animation: n.exiting ? "notice-shelf-out 0.18s ease-in forwards" : "notice-shelf-in 0.18s ease-out both",
          }}
        >
          {n.message}
        </div>
      ))}
    </div>
  );
}
