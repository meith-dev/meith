/**
 * F36 — rendering a post body, and the policy for storing the result.
 *
 * Rendering is pure and cheap for one post and not cheap for fifty of them on
 * every load of every thread, so the HTML is stored next to the message
 * (`posts.message_html`) by whoever writes the post. Two things follow, and
 * both are the reason `postBodyHtml` is a function rather than a comment:
 *
 *  - **A stored render is only usable at the version that produced it.** A
 *    renderer change — a fixed escaping bug, a new construct, a tightened URL
 *    policy — bumps `RENDER_VERSION`, and from that moment every stored render
 *    is ignored until it is rewritten. That is what makes the cache safe to fix
 *    forward: a security fix takes effect on the next page load, everywhere,
 *    without a migration and without waiting for the backfill to catch up.
 *  - **A stale or missing render is never an error.** It renders live. The
 *    backfill task exists so that stops being the common case, not so the read
 *    path can depend on having run.
 */
import { bbcodeToMarkdown } from './bbcode'
import { parse, type ParseOptions } from './blocks'
import type { CompiledSmilies } from './extensions'
import { renderDocument } from './render'
import type { BoardVocabulary } from './vocabulary'

/**
 * Current version of the renderer's output. Bump to invalidate every render.
 *
 * Three: version 1 was BBCode, version 2 the first Markdown renderer, and
 * three adds `@name` mentions — a stored version-2 render of a post that says
 * `@ada` has her as plain text, so it is stale the moment this deploys,
 * renders live, and is rewritten behind the read path.
 */
export const RENDER_VERSION = 3

/**
 * Which language a stored source column is written in.
 *
 * Zero is BBCode because zero is what `ALTER TABLE … ADD COLUMN` gives every
 * row that already existed, and every row that already existed is BBCode. New
 * rows are written as Markdown explicitly, by every write path, and the column
 * default was moved to Markdown in the same migration so a path that somehow
 * did not would still be right.
 */
export const BodyFormat = {
  LegacyBBCode: 0,
  Markdown: 1,
} as const
export type BodyFormat = (typeof BodyFormat)[keyof typeof BodyFormat]

export interface RenderedBody {
  /** Trusted HTML. Safe to insert without further escaping — that is the point. */
  readonly html: string
  /** True when a limit demoted part of the body to plain text. */
  readonly truncated: boolean
  /** The renderer version that produced `html`. Store it with the HTML. */
  readonly version: number
}

export interface MarkdownRenderOptions extends ParseOptions {
  readonly smilies?: CompiledSmilies | undefined
  /** Where a post's `#` starts. See `RenderContext.headingOffset`. */
  readonly headingOffset?: number
}

/** Render a body. Never throws: bad input degrades to text. */
export function renderMarkdown(source: string, options: MarkdownRenderOptions = {}): RenderedBody {
  const document = parse(source, options)
  return {
    html: renderDocument(document, {
      smilies: options.smilies,
      ...(options.headingOffset === undefined ? {} : { headingOffset: options.headingOffset }),
    }),
    truncated: document.truncated,
    version: RENDER_VERSION,
  }
}

/**
 * Source in whatever language the row claims, as Markdown.
 *
 * The default when a caller supplies no format is **Markdown**, not BBCode, and
 * that direction is deliberate. A legacy row read as Markdown shows a few
 * `[b]` tags until the backfill reaches it — visible, harmless, self-healing. A
 * Markdown row read as BBCode would be run through the converter and come back
 * with its asterisks escaped, which is a permanent corruption of somebody's
 * post. Only a caller that *knows* a row is old says so.
 */
export function sourceAsMarkdown(source: string, format: number | undefined): string {
  return (format ?? BodyFormat.Markdown) === BodyFormat.LegacyBBCode ? bbcodeToMarkdown(source) : source
}

/** The shape the read path must supply. A post listing row satisfies it. */
export interface RenderablePost {
  readonly message: string
  readonly messageHtml: string | null
  readonly renderVersion: number
  /** `BodyFormat`. Absent reads as Markdown — see `sourceAsMarkdown`. */
  readonly bodyFormat?: number
  /**
   * The board vocabulary the stored render was made with (F71).
   *
   * Optional, and absent reads as `0` — which is both the column default and
   * the revision of a board that has configured nothing, so a board without
   * smilies or directives is unaffected. A caller that *forgets* it on a board
   * that has one gets a live render rather than a wrong one, which is the
   * direction this defaults in on purpose.
   */
  readonly vocabVersion?: number
}

/**
 * The post body as HTML: the stored render when it is current, else a live one.
 *
 * Trusted output in both branches — it is this package's own construction, and
 * the stored column is only ever written from `renderMarkdown` above.
 *
 * "Current" is three questions now. The renderer's code and the board's
 * vocabulary were always two of them (F36, F71); the third is whether the
 * source is still BBCode, because a row nobody has converted yet cannot have a
 * usable render whatever version it claims.
 */
export function postBodyHtml(post: RenderablePost, vocabulary?: BoardVocabulary): string {
  const revision = vocabulary?.revision ?? 0
  const format = post.bodyFormat ?? BodyFormat.Markdown

  if (
    post.messageHtml !== null &&
    post.renderVersion === RENDER_VERSION &&
    format === BodyFormat.Markdown &&
    (post.vocabVersion ?? 0) === revision
  ) {
    return post.messageHtml
  }

  return renderMarkdown(sourceAsMarkdown(post.message, format), vocabularyOptions(vocabulary)).html
}

/**
 * The render options a vocabulary implies.
 *
 * One place, so a call site cannot pass the directives and forget the smilies —
 * which would render a board's directives and silently drop its smilies, on a
 * page that looked like it worked.
 */
export function vocabularyOptions(vocabulary: BoardVocabulary | undefined): MarkdownRenderOptions {
  if (vocabulary === undefined) return {}
  return vocabulary.smilies === undefined
    ? { directives: vocabulary.directives }
    : { directives: vocabulary.directives, smilies: vocabulary.smilies }
}
