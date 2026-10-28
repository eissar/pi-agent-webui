// Process-local roots that should be browsable in addition to roots derived
// from persisted sessions. The Agent Host owns this state for its lifetime.
export type AllowedRootsCache = { roots: Set<string>; expiresAt: number };

const additionalAllowedRoots = new Set<string>();
let allowedRootsCache: AllowedRootsCache | undefined;
let allowedRootsGeneration = 0;

export function normalizeSlashes(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function getAdditionalAllowedRoots(): Set<string> {
  return additionalAllowedRoots;
}

export function getAllowedRootsCache(): AllowedRootsCache | undefined {
  return allowedRootsCache;
}

export function setAllowedRootsCache(cache: AllowedRootsCache | undefined): void {
  allowedRootsCache = cache;
}

/** Snapshot the invalidation generation before starting an async roots scan. */
export function getAllowedRootsGeneration(): number {
  return allowedRootsGeneration;
}

/**
 * Publish a scan result only if no invalidation happened while it was running.
 * This prevents an older async scan from restoring stale roots with a long TTL.
 */
export function setAllowedRootsCacheIfCurrent(cache: AllowedRootsCache, generation: number): boolean {
  if (generation !== allowedRootsGeneration) return false;
  allowedRootsCache = cache;
  return true;
}

export function allowFileRoot(root: string): void {
  if (!root) return;
  const normalizedRoot = normalizeSlashes(root);
  const additionalRoots = getAdditionalAllowedRoots();
  const added = !additionalRoots.has(normalizedRoot);
  additionalRoots.add(normalizedRoot);
  allowedRootsCache?.roots.add(normalizedRoot);
  if (added) allowedRootsGeneration++;
}

/** Drop the TTL cache so the next getAllowedFileRoots() re-scans sessions. */
export function invalidateAllowedRootsCache(): void {
  allowedRootsCache = undefined;
  allowedRootsGeneration++;
}

// Sessions are not watched, so keep the TTL short: session cwds created by an
// external Pi CLI still appear promptly.
const ALLOWED_ROOTS_TTL_MS = 5_000;

export function allowedRootsCacheTtlMs(): number {
  return ALLOWED_ROOTS_TTL_MS;
}
