import type { BrowserErrorCode, BrowserRecovery } from "../contract/browser.ts";

type ParentRpcError = {
  message: string;
  code?: BrowserErrorCode;
  retryable?: boolean;
  recovery?: BrowserRecovery;
  details?: Record<string, unknown>;
};
export class MainProcessRpcError extends Error {
  readonly code?: BrowserErrorCode;
  readonly retryable: boolean;
  readonly recovery?: BrowserRecovery;
  readonly details?: Record<string, unknown>;

  constructor(value: ParentRpcError) {
    const recovery = value.recovery
      ? ` Recovery: ${value.recovery.remediation}; reason=${value.recovery.reason}; retryable=${value.recovery.retryable}.`
      : "";
    super(value.code ? `${value.code}: ${value.message}.${recovery}` : value.message);
    this.name = "MainProcessRpcError";
    this.code = value.code;
    this.retryable = value.retryable === true;
    this.recovery = value.recovery ? structuredClone(value.recovery) : undefined;
    this.details = value.details ? structuredClone(value.details) : undefined;
  }
}

export function callMain<T>(_method: string, params?: unknown, _timeoutMs = 10_000): Promise<T> {
  void params;
  // Plain Node: there is no Electron parent process to route requests to.
  return Promise.reject(new Error("Main process channel is unavailable"));
}
