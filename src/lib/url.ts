/**
 * URL safety helpers for user-entered links (doc links, repo/staging URLs,
 * freeform metadata links). User input rendered into <a href> is an XSS vector
 * if a "javascript:" (or similar) scheme sneaks in, so anything we render as a
 * link must pass through safeHref() first.
 */

/** Schemes we allow user-entered links to open. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Returns a safe href for an anchor, or undefined when the value can't be
 * parsed as an allowed absolute URL. Undefined means "render as plain text".
 */
export function safeHref(raw?: string): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : undefined;
  } catch {
    // Not an absolute URL. Be forgiving with pasted "example.com/doc" style
    // values: try https, but never guess for strings with an explicit scheme.
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return undefined;
    try {
      const url = new URL(`https://${value}`);
      return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : undefined;
    } catch {
      return undefined;
    }
  }
}

/** A plain-address email check for mailto: links (no header injection via ?cc=…). */
export function safeMailto(raw?: string): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!/^[^\s@?&=,;]+@[^\s@?&=,;]+\.[^\s@?&=,;]+$/.test(value)) return undefined;
  return `mailto:${value}`;
}
