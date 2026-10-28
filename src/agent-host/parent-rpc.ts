/**
 * Leftover from the Electron build, where the Agent Host could call into the
 * main process. The standalone server has no parent process, so every call
 * rejects and callers use their fallbacks.
 */
export function callMain<T>(_method: string, _params?: unknown, _timeoutMs = 10_000): Promise<T> {
  return Promise.reject(new Error("Main process channel is unavailable"));
}
