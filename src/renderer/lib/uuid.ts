/**
 * UUID v4 generation that works in any browsing context.
 *
 * `crypto.randomUUID()` is only exposed in secure contexts (HTTPS or
 * localhost), so plain-HTTP access via a hostname (e.g. a LAN dev server)
 * would throw. `crypto.getRandomValues()` is available everywhere, so we
 * build the UUID from it and only fall back to `randomUUID`-free paths for
 * ancient browsers without WebCrypto.
 */
export function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    // Set version 4 and variant bits per RFC 4122.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last resort for environments without WebCrypto at all.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
