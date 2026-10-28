import assert from "node:assert/strict";
import test from "node:test";

import {
  allowFileRoot,
  allowedRootsCacheTtlMs,
  getAllowedRootsCache,
  getAllowedRootsGeneration,
  invalidateAllowedRootsCache,
  setAllowedRootsCache,
  setAllowedRootsCacheIfCurrent,
} from "./allowed-roots.ts";

test("allowed-roots cache uses a short TTL", () => {
  assert.equal(allowedRootsCacheTtlMs(), 5_000);
});

test("allowFileRoot updates the live cache and invalidates an in-flight scan generation", () => {
  setAllowedRootsCache({ roots: new Set(["/a"]), expiresAt: Date.now() + 60_000 });
  const scanGeneration = getAllowedRootsGeneration();

  allowFileRoot("C:\\work\\repo");
  assert.ok(getAllowedRootsCache().roots.has("C:/work/repo"), "new root is visible without waiting for a re-scan");
  assert.ok(getAllowedRootsGeneration() > scanGeneration);
  assert.equal(
    setAllowedRootsCacheIfCurrent({ roots: new Set(["/stale"]), expiresAt: Date.now() + 60_000 }, scanGeneration),
    false,
  );
  assert.ok(getAllowedRootsCache().roots.has("C:/work/repo"), "a stale scan cannot overwrite the new root");

  invalidateAllowedRootsCache();
  assert.equal(getAllowedRootsCache(), undefined);
});

test("an invalidated async scan cannot restore a stale cache entry", () => {
  invalidateAllowedRootsCache();
  const scanGeneration = getAllowedRootsGeneration();

  invalidateAllowedRootsCache();
  const accepted = setAllowedRootsCacheIfCurrent(
    { roots: new Set(["/stale"]), expiresAt: Date.now() + 10 * 60_000 },
    scanGeneration,
  );

  assert.equal(accepted, false);
  assert.equal(getAllowedRootsCache(), undefined);

  const currentGeneration = getAllowedRootsGeneration();
  const fresh = { roots: new Set(["/fresh"]), expiresAt: Date.now() + 10 * 60_000 };
  assert.equal(setAllowedRootsCacheIfCurrent(fresh, currentGeneration), true);
  assert.equal(getAllowedRootsCache(), fresh);
});
