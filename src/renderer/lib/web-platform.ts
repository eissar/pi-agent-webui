/**
 * Browser-side platform helpers for the web UI.
 *
 * Replaces the old Electron `window.piBridge` surface with the few capabilities
 * a web page can actually provide.
 */
import type { ChatAppearancePreferences } from "@shared/chat-appearance";

export type ClientPlatform = "darwin" | "win32" | "linux";

export interface WebUiState {
  chatAppearance?: ChatAppearancePreferences;
}

const STORAGE_KEY = "pi.webuiState";

function detectPlatform(): ClientPlatform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "darwin";
  if (/Win/i.test(ua)) return "win32";
  return "linux";
}

/** Operating system of the machine running the browser (best effort, from the user agent). */
export const clientPlatform: ClientPlatform = detectPlatform();

export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function getUiState(): WebUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WebUiState) : {};
  } catch {
    return {};
  }
}

export function setUiState(patch: Partial<WebUiState>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getUiState(), ...patch }));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}
