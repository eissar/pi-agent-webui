import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
  type JSX,
  type ReactNode,
} from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import { SyntaxHighlighter, vs, vscDarkPlus } from "@/lib/syntax-highlight";
import { useTheme } from "@/hooks/useTheme";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { resolveLocalFileHref } from "@/lib/file-links";
import { markdownRehypePlugins, markdownRemarkPlugins } from "@/lib/markdown";
import { shouldHighlightCode } from "@/lib/code-highlight-policy";
import { SessionProfiler } from "./SessionProfiler";
import { scaledChatFont } from "@/lib/chat-appearance";

interface MarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  imageBasePath?: string;
  sourceSessionId?: string | null;
}

type MarkdownRenderContextValue = Pick<
  MarkdownBodyProps,
  "isStreaming" | "cwd" | "imageBasePath" | "sourceSessionId"
>;

const MarkdownRenderContext = createContext<MarkdownRenderContextValue>({});

type MarkdownComponentProps<Tag extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[Tag] & {
  node?: unknown;
};

function MarkdownCode({ className, children, node: _node, ...props }: MarkdownComponentProps<"code">) {
  const { isStreaming } = useContext(MarkdownRenderContext);
  const lang = className?.replace("language-", "").toLowerCase() ?? "";
  const raw = String(children);
  const isBlock = className?.includes("language-") || raw.includes("\n");
  if (isBlock) {
    return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} isStreaming={isStreaming} />;
  }
  return (
    <code className="markdown-inline-code" {...props}>
      {children}
    </code>
  );
}

function MarkdownPre({ children }: MarkdownComponentProps<"pre">) {
  return <>{children}</>;
}

function MarkdownImg({ src, alt, node: _node, ...props }: MarkdownComponentProps<"img">) {
  const { cwd, imageBasePath, sourceSessionId } = useContext(MarkdownRenderContext);
  return (
    <MarkdownImage
      src={src}
      alt={alt}
      cwd={cwd}
      relativeBase={imageBasePath ?? cwd}
      sourceSessionId={sourceSessionId}
      {...props}
    />
  );
}

function MarkdownTable({ children }: MarkdownComponentProps<"table">) {
  return (
    <div className="markdown-table-wrap">
      <table>{children}</table>
    </div>
  );
}

const markdownComponents: Components = {
  code: MarkdownCode,
  pre: MarkdownPre,
  img: MarkdownImg,
  table: MarkdownTable,
};

// react-markdown 10 strips non-web protocols from href/src via defaultUrlTransform
// (file: becomes ""). Local file links are this app's core feature, so allow file:.
type UrlTransform = (url: string, key: string, node: unknown) => string;
const fileAwareUrlTransform: UrlTransform = (url, key, node) => {
  if (/^file:/i.test(url)) return url;
  return (defaultUrlTransform as UrlTransform)(url, key, node);
};

export const MarkdownBody = memo(function MarkdownBody({
  children,
  className,
  isStreaming,
  cwd,
  imageBasePath,
  sourceSessionId,
}: MarkdownBodyProps) {
  // Bound synchronous parsing while content grows; settlement renders the original source in full.
  const lightweightPreview = isStreaming && children.length > 2048;
  const normalizedMarkdown = lightweightPreview ? "" : children;
  const renderContext = useMemo(
    () => ({ isStreaming, cwd, imageBasePath, sourceSessionId }),
    [cwd, imageBasePath, isStreaming, sourceSessionId],
  );

  return (
    <SessionProfiler id="MarkdownBody">
      <MarkdownRenderContext.Provider value={renderContext}>
        <div className={["markdown-body", className].filter(Boolean).join(" ")}>
          {lightweightPreview ? (
            <div data-streaming-preview style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {children}
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={markdownRemarkPlugins}
              rehypePlugins={markdownRehypePlugins}
              urlTransform={fileAwareUrlTransform}
              components={markdownComponents}
            >
              {normalizedMarkdown}
            </ReactMarkdown>
          )}
        </div>
      </MarkdownRenderContext.Provider>
    </SessionProfiler>
  );
});

export function getMarkdownComponentIdentityForTest(): Components {
  return markdownComponents;
}

function MarkdownImage({
  src,
  alt,
  cwd,
  relativeBase,
  sourceSessionId,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  cwd?: string;
  relativeBase?: string;
  sourceSessionId?: string | null;
}) {
  const localPath = useMemo(
    () => resolveLocalFileHref(typeof src === "string" ? src : undefined, cwd, relativeBase),
    [cwd, relativeBase, src],
  );
  const [previewSrc, setPreviewSrc] = useState<string | null>(localPath ? null : typeof src === "string" ? src : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!localPath) {
      setPreviewSrc(typeof src === "string" ? src : null);
      setFailed(false);
      return;
    }

    let disposed = false;
    let revoke: (() => void) | null = null;
    setPreviewSrc(null);
    setFailed(false);

    void import("@/lib/file-blob")
      .then(({ fileToObjectUrl }) => fileToObjectUrl(localPath, sourceSessionId))
      .then((result) => {
        if (disposed) {
          result.revoke();
          return;
        }
        revoke = result.revoke;
        setPreviewSrc(result.url);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      revoke?.();
    };
  }, [localPath, sourceSessionId, src]);

  if (failed) {
    return (
      <span className="markdown-image-error" title={localPath ?? undefined}>
        {alt || "Image failed to load"}
      </span>
    );
  }

  if (!previewSrc) {
    return <span className="markdown-image-loading" aria-label={alt || "Loading image"} />;
  }

  return <img src={previewSrc} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" {...props} />;
}

const CodeBlock = memo(function CodeBlock({
  code,
  lang,
  headerAction,
  isStreaming,
}: {
  code: string;
  lang: string;
  headerAction?: ReactNode;
  isStreaming?: boolean;
}) {
  const { isDark } = useTheme();
  const { copied, copy } = useCopyFeedback();

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span className="markdown-code-lang">{lang || "text"}</span>
        <div className="markdown-code-actions">
          {headerAction}
          <button onClick={() => void copy(code)} className="markdown-code-action">
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>
      {!isStreaming && shouldHighlightCode(code) ? (
        <SyntaxHighlighter
          language={lang || "text"}
          style={isDark ? vscDarkPlus : vs}
          showLineNumbers
          lineNumberStyle={{ color: "var(--text-dim)", fontStyle: "normal" }}
          customStyle={{
            margin: 0,
            padding: "11px 13px",
            fontSize: scaledChatFont(12.5),
            lineHeight: 1.62,
            borderRadius: 0,
            background: "color-mix(in srgb, var(--bg) 92%, var(--bg-panel))",
          }}
          codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
        >
          {code}
        </SyntaxHighlighter>
      ) : (
        <pre
          style={{
            margin: 0,
            padding: "11px 13px",
            fontSize: scaledChatFont(12.5),
            lineHeight: 1.62,
            overflow: "auto",
            whiteSpace: "pre",
            fontFamily: "var(--font-mono)",
            background: "color-mix(in srgb, var(--bg) 92%, var(--bg-panel))",
          }}
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
});
