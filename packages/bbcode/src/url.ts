/**
 * F36 — what may become an `href` or a `src`.
 *
 * An allowlist, never a blocklist. `javascript:` is not rejected by name here;
 * it is rejected because it is not `http://`, `https://`, or a same-origin
 * path, and so is every spelling of it — `JaVaScRiPt:`, `java&#9;script:`,
 * `&#106;avascript:`. A blocklist has to anticipate the spelling; this does
 * not, which is the only reason it can be trusted against input nobody has
 * seen yet.
 */
import { DEFAULT_LIMITS } from './limits'

/**
 * Characters that must never appear in a URL we emit.
 *
 * Quotes and angle brackets are escaped downstream anyway; a URL containing
 * them is a mis-parse rather than a link, and letting one through would produce
 * an `href` full of entities that goes somewhere nobody intended. Whitespace and
 * control characters are here because browsers strip some of them *before*
 * resolving a scheme, which is how a tab inside `java<tab>script:` navigates.
 */
// eslint-disable-next-line no-control-regex -- URL smuggling relies on exactly these
const FORBIDDEN = /[\u0000-\u0020\u007f"'<>`\\{}|^]/

const ABSOLUTE = /^https?:\/\/[^/]/i
const MAILTO = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i

export interface UrlPolicy {
  readonly maxLength?: number
  /** Allow `mailto:` — true only for `[email]`, so `[url]` cannot emit one. */
  readonly allowMailto?: boolean
}

/**
 * The URL if it is safe to emit, otherwise `null`.
 *
 * Returning `null` rather than throwing is the whole ergonomics of this module:
 * a bad URL in a post demotes that one tag to plain text and the rest of the
 * body renders normally.
 */
export function safeUrl(value: string, policy: UrlPolicy = {}): string | null {
  const url = value.trim()
  const maxLength = policy.maxLength ?? DEFAULT_LIMITS.maxUrlLength

  if (url.length === 0 || url.length > maxLength) return null
  if (FORBIDDEN.test(url)) return null

  if (ABSOLUTE.test(url)) return url
  if (policy.allowMailto === true && MAILTO.test(url)) return url

  /*
   * A same-origin path. `//host` is excluded on purpose: it is protocol-
   * relative and therefore an absolute URL to another origin wearing a path's
   * clothes, which is the same trap `/redirect` closed at F34. A backslash is
   * excluded by FORBIDDEN above for the same reason — several browsers
   * normalise it to a slash, so `/\evil.example` leaves the board.
   */
  if (url.startsWith('/') && !url.startsWith('//')) return url

  return null
}

/** `[img]` is stricter: an image is fetched, so no `mailto:` and no data URL. */
export function safeImageUrl(value: string): string | null {
  /*
   * `data:` never reaches here (it is not in the allowlist), and that is not an
   * oversight: `data:image/svg+xml` is a script-execution context in an <img>
   * on some browsers, and inline images bloat every cached render of the post.
   */
  return safeUrl(value)
}
