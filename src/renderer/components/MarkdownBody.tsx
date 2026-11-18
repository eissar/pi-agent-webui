import { memo, useEffect, useMemo, useRef } from "react";
import {
  Markdown,
  defaultUrlTransform,
  type Components,
  type ControlsConfig,
  type PluginConfig,
} from "@pierre/words/react";
import "@pierre/words/styles.css";

import { useTheme } from "@/hooks/useTheme";
import { resolveLocalFileHref } from "@/lib/file-links";
import { linkifyLocalFileHtml } from "@/lib/markdown";
import { getMarkdownHighlightsPlugin } from "@/lib/syntax-highlight";
import { SessionProfiler } from "./SessionProfiler";

interface MarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  imageBasePath?: string;
  sourceSessionId?: string | null;
}

const CONTROLS_CONFIG: ControlsConfig = {
  code: { copy: true, download: false },
};

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readHtmlAttr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  if (!match) return undefined;
  return decodeHtmlAttr(match[1] ?? match[2] ?? "");
}

function createMarkdownComponents(
  cwd: string | undefined,
  relativeBase: string | undefined,
): Components {
  return {
    p: linkifyLocalFileHtml,
    li: linkifyLocalFileHtml,
    td: linkifyLocalFileHtml,
    th: linkifyLocalFileHtml,
    blockquote: linkifyLocalFileHtml,
    h1: linkifyLocalFileHtml,
    h2: linkifyLocalFileHtml,
    h3: linkifyLocalFileHtml,
    h4: linkifyLocalFileHtml,
    h5: linkifyLocalFileHtml,
    h6: linkifyLocalFileHtml,
    table: (html: string) => `<div class="markdown-table-wrap">${html}</div>`,
    img: (html: string) => {
      const src = readHtmlAttr(html, "src");
      const alt = readHtmlAttr(html, "alt") ?? "";
      const localPath = resolveLocalFileHref(src, cwd, relativeBase);
      if (localPath) {
        return `<span class="markdown-image-loading" data-local-image-src="${escapeHtmlAttr(localPath)}" data-local-image-alt="${escapeHtmlAttr(alt)}" aria-label="${escapeHtmlAttr(alt || "Loading image")}"></span>`;
      }
      if (!/\bloading=/i.test(html)) {
        return html.replace(/<img\b/i, '<img loading="lazy" referrerpolicy="no-referrer"');
      }
      return html;
    },
  };
}

export const MarkdownBody = memo(function MarkdownBody({
  children,
  className,
  isStreaming,
  cwd,
  imageBasePath,
  sourceSessionId,
}: MarkdownBodyProps) {
  const { isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const relativeBase = imageBasePath ?? cwd;

  const plugins = useMemo<PluginConfig>(
    () => ({ code: getMarkdownHighlightsPlugin(isDark) }),
    [isDark],
  );

  const components = useMemo<Components>(
    () => createMarkdownComponents(cwd, relativeBase),
    [cwd, relativeBase],
  );

  const urlTransform = useMemo(
    () => (url: string, key: "href" | "src") => {
      if (/^file:/i.test(url)) return url;
      if (key === "src" && resolveLocalFileHref(url, cwd, relativeBase)) return url;
      return defaultUrlTransform(url);
    },
    [cwd, relativeBase],
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let disposed = false;
    const revokers = new Set<() => void>();
    const active = new WeakSet<HTMLElement>();

    const hydrateLocalImages = () => {
      const placeholders = root.querySelectorAll<HTMLElement>("[data-local-image-src]");
      for (const placeholder of placeholders) {
        if (active.has(placeholder)) continue;
        const localPath = placeholder.getAttribute("data-local-image-src");
        if (!localPath) continue;
        const alt = placeholder.getAttribute("data-local-image-alt") ?? "";
        active.add(placeholder);

        void import("@/lib/file-blob")
          .then(({ fileToObjectUrl }) => fileToObjectUrl(localPath, sourceSessionId))
          .then((result) => {
            if (disposed || !placeholder.isConnected) {
              result.revoke();
              return;
            }
            revokers.add(result.revoke);
            const img = document.createElement("img");
            img.src = result.url;
            img.alt = alt;
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            placeholder.replaceWith(img);
          })
          .catch(() => {
            if (disposed || !placeholder.isConnected) return;
            const err = document.createElement("span");
            err.className = "markdown-image-error";
            err.title = localPath;
            err.textContent = alt || "Image failed to load";
            placeholder.replaceWith(err);
          });
      }
    };

    hydrateLocalImages();
    const observer = new MutationObserver(hydrateLocalImages);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      for (const revoke of revokers) revoke();
      revokers.clear();
    };
  }, [sourceSessionId]);

  return (
    <SessionProfiler id="MarkdownBody">
      <div ref={containerRef} className={["markdown-body", className].filter(Boolean).join(" ")}>
        <Markdown
          mode="streaming"
          isAnimating={Boolean(isStreaming)}
          cjk
          lineNumbers
          controls={CONTROLS_CONFIG}
          plugins={plugins}
          urlTransform={urlTransform}
          components={components}
        >
          {children}
        </Markdown>
      </div>
    </SessionProfiler>
  );
});
