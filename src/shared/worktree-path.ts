// Pure path-comparison helpers shared by the Agent Host and the renderer.
// Keep this module free of Node.js dependencies — the renderer bundles it.
import { normalizeSlashes } from "./allowed-roots.ts";

// Browsers have no `process` global. There we fall back to "" (case-sensitive
// comparison); callers that know the server platform should pass it explicitly.
function detectComparisonPlatform(): NodeJS.Platform | "" {
  if (typeof process !== "undefined" && process.platform) return process.platform;
  return "";
}

export function normalizeWorktreePathForComparison(
  filePath: string,
  platform: NodeJS.Platform | "" = detectComparisonPlatform(),
): string {
  let normalized = normalizeSlashes(filePath.trim());
  if (normalized.length > 1 && !/^[A-Za-z]:\/$/.test(normalized)) normalized = normalized.replace(/\/+$/, "");
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function worktreePathsEqual(
  left: string,
  right: string,
  platform: NodeJS.Platform | "" = detectComparisonPlatform(),
): boolean {
  return normalizeWorktreePathForComparison(left, platform) === normalizeWorktreePathForComparison(right, platform);
}
