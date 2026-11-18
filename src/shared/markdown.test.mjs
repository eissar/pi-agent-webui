import assert from "node:assert/strict";
import test from "node:test";

import {
  linkifyLocalFileHtml,
  linkifyLocalFileText,
} from "./markdown.ts";

test("linkifyLocalFileHtml linkifies text nodes and skips links, code, pre, and tag attributes", () => {
  const html =
    '<p data-path="/tmp/attr.txt">See /tmp/plain.txt and <code>/tmp/inline.txt</code></p>' +
    '<pre><code>/tmp/block.txt</code></pre>' +
    '<a href="https://example.com/x">/tmp/existing.txt</a>';
  const result = linkifyLocalFileHtml(html);
  assert.match(result, /<a data-markdown="a" href="file:\/\/\/tmp\/plain\.txt">\/tmp\/plain\.txt<\/a>/);
  assert.match(result, /data-path="\/tmp\/attr\.txt"/);
  assert.match(result, /<code>\/tmp\/inline\.txt<\/code>/);
  assert.match(result, /<pre><code>\/tmp\/block\.txt<\/code><\/pre>/);
  assert.match(result, /<a href="https:\/\/example\.com\/x">\/tmp\/existing\.txt<\/a>/);
});

function linkTargets(value) {
  return linkifyLocalFileText(value)
    .filter((node) => node.type === "link")
    .map((node) => [node.children[0].value, node.url]);
}

test("links POSIX, Windows, UNC, and canonical file URLs from ordinary text nodes", () => {
  assert.deepEqual(linkTargets("at /home/me/src/main.ts:10 now"), [
    ["/home/me/src/main.ts:10", "file:///home/me/src/main.ts:10"],
  ]);
  assert.deepEqual(linkTargets(String.raw`at C:\Users\me\Pi Desktop.exe now`), [
    [String.raw`C:\Users\me\Pi Desktop.exe`, "file:///C:/Users/me/Pi%20Desktop.exe"],
  ]);
  assert.deepEqual(linkTargets(String.raw`at \\server\share\report.docx now`), [
    [String.raw`\\server\share\report.docx`, "file://server/share/report.docx"],
  ]);
  assert.deepEqual(linkTargets("at file:///tmp/a%20b.txt now"), [["file:///tmp/a%20b.txt", "file:///tmp/a%20b.txt"]]);
});

test("links multiple paths while preserving trailing punctuation and @ project references", () => {
  const nodes = linkifyLocalFileText("@src/main.ts then /tmp/a.txt, and /tmp/b.txt.");
  assert.equal(
    nodes.map((node) => (node.type === "text" ? node.value : node.children[0].value)).join(""),
    "@src/main.ts then /tmp/a.txt, and /tmp/b.txt.",
  );
  assert.deepEqual(
    nodes.filter((node) => node.type === "link").map((node) => node.url),
    ["file:///tmp/a.txt", "file:///tmp/b.txt"],
  );
});

test("separates adjacent local paths joined by English or Chinese prose", () => {
  assert.deepEqual(linkTargets("compare /tmp/a.txt 和 /tmp/b.txt"), [
    ["/tmp/a.txt", "file:///tmp/a.txt"],
    ["/tmp/b.txt", "file:///tmp/b.txt"],
  ]);
  assert.deepEqual(linkTargets("compare /tmp/a.txt and /tmp/b.txt"), [
    ["/tmp/a.txt", "file:///tmp/a.txt"],
    ["/tmp/b.txt", "file:///tmp/b.txt"],
  ]);
});

test("links local filenames containing spaces and absolute directories without extensions", () => {
  assert.deepEqual(linkTargets("open /tmp/a b.txt now"), [["/tmp/a b.txt", "file:///tmp/a%20b.txt"]]);
  assert.deepEqual(linkTargets("open /tmp/pi-desktop-ui-test.Xu9qVi/repo/folder now"), [
    ["/tmp/pi-desktop-ui-test.Xu9qVi/repo/folder", "file:///tmp/pi-desktop-ui-test.Xu9qVi/repo/folder"],
  ]);
});



test("does not treat web URLs, relative @ references, or bare drive roots as local paths", () => {
  assert.deepEqual(linkTargets("https://example.com/x @src/main.ts C:\\"), []);
});
