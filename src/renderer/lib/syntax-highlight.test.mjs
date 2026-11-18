import { importTestBundle } from "#test-bundle";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

const { getMarkdownHighlightsPlugin } = await importTestBundle("src/renderer/lib/syntax-highlight", {
  entryPoints: [path.join(import.meta.dirname, "syntax-highlight.ts")],
  tsconfig: path.join(import.meta.dirname, "../../../tsconfig.renderer.json"),
  packages: "external",
});

test("common aliases and grammars go through @pierre/highlights", () => {
  const plugin = getMarkdownHighlightsPlugin(false);
  const samples = {
    zsh: "if true; then echo ok; fi",
    "c++": "int main() { return 0; }",
    patch: "+added line",
    golang: "func main() { return }",
    jsonl: '{"ok": true}',
    rs: "fn main() { let ok = true; }",
    powershell: 'Write-Host "hello"',
    lua: "local ok = true",
    r: "square <- function(x) x * x",
    dart: 'void main() { print("hello"); }',
  };

  for (const [language, code] of Object.entries(samples)) {
    const html = plugin.highlight({ code, language, isIncomplete: false });
    assert.ok(html && html.includes("<span"), `${language} should produce highlighted spans`);
  }
});

test("unknown languages and oversized blocks skip highlighting", () => {
  const plugin = getMarkdownHighlightsPlugin(true);
  assert.equal(plugin.highlight({ code: "plain words", language: "definitely-not-a-language", isIncomplete: false }), null);
  assert.equal(plugin.highlight({ code: "a".repeat(50 * 1024 + 1), language: "typescript", isIncomplete: false }), null);
});
