import { fileUrlToLocalPath, localFilePathToUrl } from "./file-url.ts";

export type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

const ABSOLUTE_PATH_PREFIX = String.raw`(?:file:\/\/|[A-Za-z]:[\\/]|\\\\|\/)`;
const PATH_LIST_SEPARATOR = String.raw`(?:\s+(?:and|or)\s+|\s*[和与及或]\s*)(?=${ABSOLUTE_PATH_PREFIX})`;
const PATH_SEGMENT_CHAR = String.raw`[^\t\n\\/:*?"<>|,;]`;
const PATH_SEGMENT = String.raw`(?:(?!${PATH_LIST_SEPARATOR})${PATH_SEGMENT_CHAR})+`;
const FILE_NAME_SEGMENT = String.raw`(?:(?!${PATH_LIST_SEPARATOR})${PATH_SEGMENT_CHAR})+?\.[A-Za-z0-9]+`;
const NO_SPACE_PATH_SEGMENT = String.raw`[^\s\t\n\\/:*?"<>|,;]+`;
const BARE_LOCAL_PATH_RE = new RegExp(
  "(?<![\\w:/])(" +
    "file:\\/\\/[^\\s<>\"']+" +
    `|[A-Za-z]:[\\\\/](?:${PATH_SEGMENT}[\\\\/])*${FILE_NAME_SEGMENT}(?::\\d+(?::\\d+)?)?(?![A-Za-z0-9./\\\\])` +
    `|\\\\\\\\(?:${PATH_SEGMENT}[\\\\/])+${FILE_NAME_SEGMENT}(?::\\d+(?::\\d+)?)?(?![A-Za-z0-9./\\\\])` +
    `|\\/(?:${PATH_SEGMENT}\\/)*${FILE_NAME_SEGMENT}(?::\\d+(?::\\d+)?)?(?![A-Za-z0-9./\\\\])` +
    `|\\/(?:${NO_SPACE_PATH_SEGMENT}\\/)+${NO_SPACE_PATH_SEGMENT}(?![\\/])` +
    ")",
  "gu",
);

const SKIPPED_HTML_TAGS = new Set(["a", "code", "pre", "svg", "math", "script", "style", "textarea"]);
const VOID_HTML_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Linkifies bare local file paths inside rendered HTML text nodes while skipping
 * existing links, code/pre blocks, SVG/MathML, and HTML tag attributes.
 */
export function linkifyLocalFileHtml(html: string): string {
  if (!html) return html;
  let out = "";
  let cursor = 0;
  let skipDepth = 0;
  const tagPattern = /<(\/?)([A-Za-z][A-Za-z0-9:-]*)(?:\s[^>]*)?(\/?)>/g;

  for (const match of html.matchAll(tagPattern)) {
    const tagStart = match.index ?? 0;
    if (tagStart > cursor) {
      const textSegment = html.slice(cursor, tagStart);
      if (skipDepth > 0) {
        out += textSegment;
      } else {
        const nodes = linkifyLocalFileText(decodeBasicHtmlEntities(textSegment));
        for (const node of nodes) {
          if (node.type === "link" && node.url) {
            const label = node.children?.[0]?.value ?? node.url;
            out += `<a data-markdown="a" href="${escapeHtmlAttr(node.url)}">${escapeHtmlText(label)}</a>`;
          } else if (node.value) {
            out += escapeHtmlText(node.value);
          }
        }
      }
    }

    const fullTag = match[0];
    const isClosing = match[1] === "/";
    const tagName = match[2].toLowerCase();
    const isSelfClosing = match[3] === "/" || VOID_HTML_TAGS.has(tagName);
    if (SKIPPED_HTML_TAGS.has(tagName)) {
      if (isClosing) {
        if (skipDepth > 0) skipDepth -= 1;
      } else if (!isSelfClosing) {
        skipDepth += 1;
      }
    }

    out += fullTag;
    cursor = tagStart + fullTag.length;
  }

  if (cursor < html.length) {
    const tail = html.slice(cursor);
    if (skipDepth > 0) {
      out += tail;
    } else {
      const nodes = linkifyLocalFileText(decodeBasicHtmlEntities(tail));
      for (const node of nodes) {
        if (node.type === "link" && node.url) {
          const label = node.children?.[0]?.value ?? node.url;
          out += `<a data-markdown="a" href="${escapeHtmlAttr(node.url)}">${escapeHtmlText(label)}</a>`;
        } else if (node.value) {
          out += escapeHtmlText(node.value);
        }
      }
    }
  }

  return out;
}

function splitLineSuffix(value: string): { path: string; suffix: string } {
  const match = /(:\d+(?::\d+)?)$/.exec(value);
  return match ? { path: value.slice(0, -match[1].length), suffix: match[1] } : { path: value, suffix: "" };
}

function trimSentencePunctuation(value: string): { value: string; trailing: string } {
  const cleaned = value.replace(/[.,;:!?)\]}]+$/, "");
  return { value: cleaned, trailing: value.slice(cleaned.length) };
}

function localPathLinkTarget(value: string): string | null {
  const { path, suffix } = splitLineSuffix(value);
  if (/^file:\/\//i.test(path)) {
    const decoded = fileUrlToLocalPath(path);
    const canonical = decoded ? localFilePathToUrl(decoded) : null;
    return canonical ? `${canonical}${suffix}` : null;
  }
  return localFilePathToUrl(path.replace(/\\/g, "/"))?.concat(suffix) ?? null;
}

export function linkifyLocalFileText(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(BARE_LOCAL_PATH_RE)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push({ type: "text", value: value.slice(cursor, index) });
    const raw = match[0];
    const { value: label, trailing } = trimSentencePunctuation(raw);
    const target = localPathLinkTarget(label);
    if (target) {
      nodes.push({ type: "link", url: target, children: [{ type: "text", value: label }] });
      if (trailing) nodes.push({ type: "text", value: trailing });
    } else {
      nodes.push({ type: "text", value: raw });
    }
    cursor = index + raw.length;
  }
  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes.length > 0 ? nodes : [{ type: "text", value }];
}


