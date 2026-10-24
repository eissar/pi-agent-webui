/**
 * Global notification ("toast") API. Usable from anywhere, not tied to a session view:
 *
 *   notify.error("Failed to save settings");
 *   notify({ type: "success", message: "Saved", id: "settings-save" }); // same id replaces
 *
 * State lives in one module-level store driven by the same reducer as the
 * per-session notice shelf, so stacking/expiry/overflow behave identically.
 */
import { NOTICE_VISIBLE_MS, noticeExpiryDelay, noticeReducer, type NoticeState, type NoticeType } from "./notice-queue";

export type { NoticeItem as NotificationItem } from "./notice-queue";

let state: NoticeState = { visible: [], pending: [] };
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function dispatch(action: Parameters<typeof noticeReducer>[1]): void {
  const next = noticeReducer(state, action);
  if (next === state) return;
  state = next;
  schedule();
  for (const l of [...listeners]) l();
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (state.visible.length === 0) return;
  const exiting = state.visible.find((n) => n.exiting);
  timer = exiting
    ? setTimeout(() => dispatch({ type: "remove", id: exiting.id, now: Date.now() }), 180)
    : setTimeout(() => dispatch({ type: "mark_oldest_exiting" }), noticeExpiryDelay(state.visible[0], Date.now()));
}

export interface NotifyOptions {
  message: string;
  type?: NoticeType;
  id?: string;
}

function push(opts: NotifyOptions): void {
  const message = opts.message?.trim();
  if (!message) return;
  seq += 1;
  dispatch({
    type: "add",
    notice: {
      id: opts.id ?? `n${seq}_${Date.now().toString(36)}`,
      message,
      type: opts.type ?? "info",
      expiresAt: Date.now() + NOTICE_VISIBLE_MS,
    },
  });
}

type Shorthand = (message: string, id?: string) => void;
export const notify: ((opts: NotifyOptions) => void) & Record<NoticeType, Shorthand> = Object.assign(push, {
  info: ((message, id) => push({ message, id, type: "info" })) as Shorthand,
  success: ((message, id) => push({ message, id, type: "success" })) as Shorthand,
  warning: ((message, id) => push({ message, id, type: "warning" })) as Shorthand,
  error: ((message, id) => push({ message, id, type: "error" })) as Shorthand,
});

/** Format an unknown thrown value for display. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getNotificationsSnapshot(): NoticeState["visible"] {
  return state.visible;
}
