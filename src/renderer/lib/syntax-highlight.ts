import type { CodeHighlighterPlugin } from "@pierre/words/react";
import { createHighlightsPlugin } from "@pierre/words/highlights";
import pierreDark from "@pierre/highlights/themes/pierre-dark";
import pierreLight from "@pierre/highlights/themes/pierre-light";

import { shouldHighlightCode } from "./code-highlight-policy";

function createBoundedHighlightsPlugin(theme: typeof pierreLight | typeof pierreDark): CodeHighlighterPlugin {
  const inner = createHighlightsPlugin({ theme });
  return {
    highlight(options) {
      if (!shouldHighlightCode(options.code)) return null;
      return inner.highlight(options);
    },
    createSession() {
      const session = inner.createSession?.();
      if (!session) {
        return {
          highlight(options) {
            return shouldHighlightCode(options.code) ? inner.highlight(options) : null;
          },
          dispose() {},
        };
      }
      return {
        highlight(options) {
          return shouldHighlightCode(options.code) ? session.highlight(options) : null;
        },
        highlightLines: session.highlightLines
          ? (options) => {
              if (!shouldHighlightCode(options.code)) return null;
              return session.highlightLines!(options);
            }
          : undefined,
        dispose() {
          session.dispose();
        },
      };
    },
  };
}

let cachedLightPlugin: CodeHighlighterPlugin | null = null;
let cachedDarkPlugin: CodeHighlighterPlugin | null = null;

export function getMarkdownHighlightsPlugin(isDark: boolean): CodeHighlighterPlugin {
  if (isDark) {
    cachedDarkPlugin ??= createBoundedHighlightsPlugin(pierreDark);
    return cachedDarkPlugin;
  }
  cachedLightPlugin ??= createBoundedHighlightsPlugin(pierreLight);
  return cachedLightPlugin;
}
