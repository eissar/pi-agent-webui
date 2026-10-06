/**
 * Browser-mode desktop bridge shim.
 *
 * When the renderer runs in a plain browser (standalone Node backend), there is
 * no Electron preload, so `window.piBridge` is missing. This shim installs a
 * conservative stand-in:
 *
 * - UI state / theme / language persist to localStorage.
 * - Harmless desktop calls (badges, agent-end notifications) are no-ops.
 * - Everything that genuinely needs the desktop shell (updates, OS file
 *   dialogs, managed Browser, credential vault, menus, diagnostics) rejects
 *   with an explicit "desktop-only" error instead of faking success.
 */
import type { PiBridge } from "@contract/desktop";
import type { PublicToolchainState } from "@shared/toolchains/types";

const STORAGE_KEY = "pi.webuiState";

function readStoredUiState(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeStoredUiState(patch: Record<string, unknown>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStoredUiState(), ...patch }));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

function detectPlatform(): NodeJS.Platform {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "darwin";
  if (/Win/i.test(ua)) return "win32";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "linux";
}

const UNSUPPORTED = (what: string): Promise<never> =>
  Promise.reject(new Error(`${what} is unavailable: this feature requires the desktop (Electron) app.`));

function emptyToolchainState(): PublicToolchainState {
  return {
    schemaVersion: 1,
    revision: 1,
    platform: detectPlatform(),
    arch: "unknown" as never,
    coreReady: false,
    capabilities: {},
    components: {},
    operations: [],
  };
}

const noopUnsubscribe = () => {};

const shimBase: Partial<PiBridge> = {
  platform: detectPlatform(),
  isDesktop: false,
} as unknown as PiBridge;
const shim = shimBase as unknown as Record<string, unknown>;

Object.assign(shim, {
  getVersion: () => Promise.resolve(String(import.meta.env.VITE_APP_VERSION ?? "browser")),
  getUpdateState: () => UNSUPPORTED("Updates"),
  checkForUpdates: () => UNSUPPORTED("Updates"),
  downloadUpdate: () => UNSUPPORTED("Updates"),
  installUpdate: () => UNSUPPORTED("Updates"),
  setAutomaticUpdateChecks: () => UNSUPPORTED("Updates"),

  getHostStatus: () => Promise.resolve<"ready">("ready"),
  onHostStatus: () => noopUnsubscribe,
  onHostRestarted: () => noopUnsubscribe,
  onHostCrashed: () => noopUnsubscribe,
  requestHostPort: () => {
    /* browser mode connects over WebSocket instead */
  },

  getToolchainState: () => Promise.resolve(emptyToolchainState()),
  rescanToolchains: () => UNSUPPORTED("Toolchain management"),
  performToolchainAction: () => UNSUPPORTED("Toolchain management"),
  onToolchainState: () => noopUnsubscribe,

  getManagedProcessCapability: () =>
    Promise.resolve({
      platform: detectPlatform(),
      arch: "unknown" as never,
      supported: false,
      ready: false,
      backend: "none",
      errorCode: "UNSUPPORTED_PLATFORM",
    }),

  getUiState: () => Promise.resolve(readStoredUiState()),
  setUiState: (patch: Record<string, unknown>) => {
    writeStoredUiState(patch as Record<string, unknown>);
    return Promise.resolve();
  },
  getThemeSource: () => {
    const state = readStoredUiState() as { themeSource?: "system" | "light" | "dark" };
    return Promise.resolve(state.themeSource ?? "system");
  },
  setThemeSource: (source: "system" | "light" | "dark") => {
    writeStoredUiState({ themeSource: source });
    return Promise.resolve();
  },

  openExternal: (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve();
  },

  notifyAgentEnd: () => undefined,
  setBadgeCount: () => undefined,
  clearBadge: () => undefined,

  onMenu: () => noopUnsubscribe,
  onDeepLinkSession: () => noopUnsubscribe,
  onBrowserEvent: () => noopUnsubscribe,
  onUpdateState: () => noopUnsubscribe,
});

const DESKTOP_ONLY = new Set([
  "showItemInFolder",
  "showFileContextMenu",
  "inspectLocalFiles",
  "selectDirectory",
  "setChannelCredential",
  "saveFile",
  "saveBinaryFile",
  "createHtmlPreview",
  "releaseHtmlPreview",
  "openLogs",
  "exportDiagnostics",
]);

const BROWSER_MANAGED = new Set(Object.keys(shim).filter((key) => key.startsWith("browser")));

/** Any other method (Browser management, file dialogs, vault, …) fails explicitly. */
const stub = new Proxy(shim as unknown as PiBridge, {
  get(target, prop: string) {
    if (prop in target) return (shim as Record<string, unknown>)[prop];
    if (DESKTOP_ONLY.has(prop) || BROWSER_MANAGED.has(prop)) {
      return () => UNSUPPORTED(`Desktop feature "${prop}"`);
    }
    if (prop.startsWith("on")) return () => noopUnsubscribe;
    return () => UNSUPPORTED(`Desktop feature "${prop}"`);
  },
});

export function installBrowserBridge(): void {
  if (typeof window === "undefined" || window.piBridge) return;
  window.piBridge = stub;
  console.info("[pi-webui] Running in browser mode — desktop-only features are disabled.");
}
