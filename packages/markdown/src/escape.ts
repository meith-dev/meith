/**
 * F36 — the only two functions in the codebase that produce HTML from text.
 *
 * The renderer's safety argument rests entirely here: it never *sanitises*
 * markup, because it never parses any. It builds an output string from a fixed
 * set of tag literals plus values that have passed through one of these two
 * functions. There is therefore no "did the sanitiser miss a vector" question
 * to answer — a vector would have to survive escaping, not evade a blocklist.
 */

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escape text for insertion between tags.
 *
 * Quotes are escaped as well as the three that strictly matter in text
 * position. It costs nothing, and it means a single function is correct in both
 * positions if a caller ever confuses them — which is the mistake that produces
 * attribute-boundary escapes.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!)
}

/**
 * Escape a value for a double-quoted attribute.
 *
 * Identical to `escapeHtml` today, and deliberately a separate name: every call
 * site reads as a claim about *where* the value is going, so an attribute that
 * later needs different treatment (a URL, a style) has one place to change.
 * Attributes are always emitted double-quoted — unquoted attributes are where
 * escaped-quote bypasses live.
 */
export function escapeAttribute(value: string): string {
  return escapeHtml(value)
}
