import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test(
  "production renderer CSP permits only packaged styles and fonts",
  { skip: !existsSync(new URL("../main/protocol.ts", import.meta.url)) },
  () => {
    const protocol = readFileSync(new URL("../main/protocol.ts", import.meta.url), "utf8");
    const appCsp = protocol.slice(protocol.indexOf("const CSP ="), protocol.indexOf("const HTML_PREVIEW_CSP"));

    assert.doesNotMatch(appCsp, /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net/);
    assert.match(appCsp, /style-src 'self' app:/);
    assert.match(appCsp, /font-src 'self' app: data:/);
  },
);
