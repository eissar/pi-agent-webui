import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./SettingsConfig.tsx", import.meta.url), "utf8");

test("automatic update checks commit only the state returned by the existing action path", () => {
  assert.match(source, /checked=\{state\?\.automaticChecksEnabled \?\? false\}/);
  assert.match(
    source,
    /void performAction\("automatic", async \(\) => \{\s*const nextState = await window\.piBridge\.setAutomaticUpdateChecks\(enabled\);\s*setState\(nextState\)/,
  );
  assert.doesNotMatch(source, /setState\(\{[\s\S]*?automaticChecksEnabled: enabled/);
});
