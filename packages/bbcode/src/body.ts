/**
 * F36 — rendering a post body, and the policy for storing the result.
 *
 * Rendering is pure and cheap for one post and not cheap for fifty of them on
 * every load of every thread, so the HTML is stored next to the message
 * (`posts.message_html`) by whoever writes the post. Two things follow, and
 * both are the reason `postBodyHtml` is a function rather than a comment:
 *
 *  - **A stored render is only usable at the version that produced it.** A
 *    renderer change — a fixed escaping bug, a new tag, a tightened URL policy
 *    — bumps `RENDER_VERSION`, and from that moment every stored render is
 *    ignored until it is rewritten. That is what makes the cache safe to fix
 *    forward: a security fix takes effect on the next page load, everywhere,
 *    without a migration and without waiting for the backfill to catch up.
 *  - **A stale or missing render is never an error.** It renders live. The
 *    backfill task exists so that stops being the common case, not so the read
 *    path can depend on having run.
 */
import { parse, type ParseOptions } from './parse'
import { renderDocument } from './render'

/** Current version of the renderer's output. Bump to invalidate every render. */
export const RENDER_VERSION = 1

export interface RenderedBody {
  /** Trusted HTML. Safe to insert without further escaping — that is the point. */
  readonly html: string
  /** True when a limit demoted part of the body to plain text. */
  readonly truncated: boolean
  /** The renderer version that produced `html`. Store it with the HTML. */
  readonly version: number
}

/** Render a post body. Never throws: bad input degrades to text. */
export function renderBBCode(source: string, options: ParseOptions = {}): RenderedBody {
  const document = parse(source, options)
  return {
    html: renderDocument(document, options.tags),
    truncated: document.truncated,
    version: RENDER_VERSION,
  }
}

/** The shape the read path must supply. A post listing row satisfies it. */
export interface RenderablePost {
  readonly message: string
  readonly messageHtml: string | null
  readonly renderVersion: number
}

/**
 * The post body as HTML: the stored render when it is current, else a live one.
 *
 * Trusted output in both branches — it is this package's own construction, and
 * the stored column is only ever written from `renderBBCode` above.
 */
export function postBodyHtml(post: RenderablePost): string {
  if (post.messageHtml !== null && post.renderVersion === RENDER_VERSION) {
    return post.messageHtml
  }
  return renderBBCode(post.message).html
}
