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
import type { CompiledSmilies } from './extensions'
import type { BoardVocabulary } from './vocabulary'

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

export interface BBCodeRenderOptions extends ParseOptions {
  readonly smilies?: CompiledSmilies
}

/** Render a post body. Never throws: bad input degrades to text. */
export function renderBBCode(source: string, options: BBCodeRenderOptions = {}): RenderedBody {
  const document = parse(source, options)
  return {
    html: renderDocument(document, options.tags, options.smilies),
    truncated: document.truncated,
    version: RENDER_VERSION,
  }
}

/** The shape the read path must supply. A post listing row satisfies it. */
export interface RenderablePost {
  readonly message: string
  readonly messageHtml: string | null
  readonly renderVersion: number
  /**
   * The board vocabulary the stored render was made with (F71).
   *
   * Optional, and absent reads as `0` — which is both the column default and
   * the revision of a board that has configured nothing, so a board without
   * smilies or custom tags is unaffected. A caller that *forgets* it on a board
   * that has one gets a live render rather than a wrong one, which is the
   * direction this defaults in on purpose.
   */
  readonly vocabVersion?: number
}

/**
 * The post body as HTML: the stored render when it is current, else a live one.
 *
 * Trusted output in both branches — it is this package's own construction, and
 * the stored column is only ever written from `renderBBCode` above.
 *
 * "Current" is now two questions, because the board's vocabulary is as much a
 * part of the renderer as its code is (F71). Either being stale means the same
 * thing it has always meant: render live, and let the backfill catch up.
 */
export function postBodyHtml(post: RenderablePost, vocabulary?: BoardVocabulary): string {
  const revision = vocabulary?.revision ?? 0

  if (
    post.messageHtml !== null &&
    post.renderVersion === RENDER_VERSION &&
    (post.vocabVersion ?? 0) === revision
  ) {
    return post.messageHtml
  }

  return renderBBCode(post.message, vocabularyOptions(vocabulary)).html
}

/**
 * The render options a vocabulary implies.
 *
 * One place, so a call site cannot pass the tags and forget the smilies — which
 * would render a board's custom tags and silently drop its smilies, on a page
 * that looked like it worked.
 */
export function vocabularyOptions(vocabulary: BoardVocabulary | undefined): BBCodeRenderOptions {
  if (vocabulary === undefined) return {}
  return vocabulary.smilies === undefined
    ? { tags: vocabulary.tags }
    : { tags: vocabulary.tags, smilies: vocabulary.smilies }
}
