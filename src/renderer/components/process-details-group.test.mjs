import { importTestBundle } from "#test-bundle";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";

const { ProcessDetailsGroup, ThinkingExpansionStore } = await importTestBundle(
  "src/renderer/components/process-details-group",
  {
    stdin: {
      contents:
        'export { ProcessDetailsGroup } from "./ProcessDetailsGroup.tsx"; export { ThinkingExpansionStore } from "../lib/thinking-expansion-store.ts";',
      resolveDir: import.meta.dirname,
      sourcefile: "process-details-group-test-entry.tsx",
      loader: "tsx",
    },
    tsconfig: path.join(import.meta.dirname, "../../../tsconfig.renderer.json"),
    alias: { react: "preact/compat", "react-dom": "preact/compat", "react/jsx-runtime": "preact/jsx-runtime" },
    external: ["preact", "preact/*", "@preact/signals"],
  },
);

function renderGroup(expansionStore, stateKey) {
  return renderToString(
    h(
      ProcessDetailsGroup,
      { expansionStore, stateKey, messageCount: 2, toolCallCount: 1 },
      h("span", null, "persisted process content"),
    ),
  );
}

const CONTENT = "persisted process content";

test("process details expansion survives a component remount and remains isolated by session store", () => {
  const sessionStore = new ThinkingExpansionStore();
  const key = "process-group:user-1:assistant-1";
  let html = renderGroup(sessionStore, key);
  assert.match(html, /aria-expanded="false"/);
  assert.equal(html.includes(CONTENT), false);

  // Toggle through the store (the button's onClick does exactly this), then re-render from scratch.
  sessionStore.toggle(key);
  html = renderGroup(sessionStore, key);
  assert.match(html, /aria-expanded="true"/);
  assert.equal(html.includes(CONTENT), true);

  // A fresh render is a remount: the expansion state lives in the store, so it persists.
  html = renderGroup(sessionStore, key);
  assert.match(html, /aria-expanded="true"/);
  assert.equal(html.includes(CONTENT), true);

  // Another session's store is isolated.
  html = renderGroup(new ThinkingExpansionStore(), key);
  assert.match(html, /aria-expanded="false"/);
});
