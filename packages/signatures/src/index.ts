/**
 * `@meith/signatures` — F58's signature half.
 *
 * A signature is member-written Markdown shown under every post they have ever
 * made. That last clause is the whole feature: it multiplies one member's text
 * across the board's heaviest pages, so it needs a **narrower set of
 * constructs**, a **length limit that is a group permission**, and a way for a
 * moderator to **stop it** without deleting what was there.
 *
 * ## Why narrower syntax rather than a validator
 *
 * The obvious implementation refuses a signature containing an image. The one
 * here parses it with images turned off, so `![me](…)` comes out as the words
 * `me`. That is better for two reasons: it cannot be bypassed by a construct
 * this build does not know about, and it degrades — a member who pastes their
 * old signature gets most of it rather than a refusal.
 *
 * `SIGNATURE_FEATURES` in `@meith/markdown` is the seam being used as designed
 * rather than a special case cut into the renderer.
 *
 * ## The avatar half is not here
 *
 * F58 also asks for avatars. An avatar is an upload (F42), and a *remote* URL
 * is not a safe substitute — see `docs/deviations.md` D61. Omitted rather than
 * half-built, per D32.
 */
import {
  BodyFormat,
  RENDER_VERSION,
  SIGNATURE_FEATURES,
  renderMarkdown,
  sourceAsMarkdown,
} from '@meith/markdown'
import { ValidationError } from '@meith/core'

/** The hard ceiling, whatever a group's `maxSignatureLength` says. */
export const SIGNATURE_HARD_MAX = 1000

/**
 * What a signature may use, and the reason for each omission, live beside the
 * parser in `@meith/markdown`'s `features.ts` — one line per construct, so the
 * rule is readable in the place that enforces it rather than restated here.
 */
export const SIGNATURE_RENDER_OPTIONS = { features: SIGNATURE_FEATURES } as const

/** What a member may do with their signature, resolved by the caller (F20). */
export interface SignatureLimits {
  /** `canUseSignature`. */
  readonly canUse: boolean
  /** `maxSignatureLength`; 0 = unlimited, so the hard max applies (R4.2). */
  readonly maxLength: number
}

/** A signature as stored. */
export interface StoredSignature {
  readonly signature: string
  readonly signatureHtml: string | null
  readonly signatureRenderVersion: number
  /** `BodyFormat`. Absent reads as Markdown, per `sourceAsMarkdown`. */
  readonly signatureFormat?: number
  readonly locked: boolean
  readonly lockedReason: string | null
}

export interface RenderedSignature {
  readonly html: string
  readonly version: number
}

/** The effective limit: the group's, or the hard ceiling. */
export function signatureLimit(limits: SignatureLimits): number {
  if (limits.maxLength <= 0) return SIGNATURE_HARD_MAX
  return Math.min(limits.maxLength, SIGNATURE_HARD_MAX)
}

/**
 * Validate and render a signature.
 *
 * The **raw** length is what the limit applies to, not the rendered HTML: a
 * member types Markdown and a limit they cannot count against is one they
 * cannot work with. It also means a renderer change can never retroactively
 * push somebody over.
 */
export function prepareSignature(
  raw: string,
  limits: SignatureLimits,
): { source: string; rendered: RenderedSignature } {
  if (!limits.canUse) {
    throw new ValidationError('Your group cannot use a signature.')
  }

  const source = raw.trim()
  const limit = signatureLimit(limits)

  if (source.length > limit) {
    throw new ValidationError(
      `A signature may be at most ${limit} characters. Yours is ${source.length}.`,
    )
  }

  const rendered = renderMarkdown(source, SIGNATURE_RENDER_OPTIONS)
  return { source, rendered: { html: rendered.html, version: rendered.version } }
}

/**
 * The HTML to show under a post, or `null` for nothing at all.
 *
 * `null` — not an empty string — for a locked signature, an empty one, and a
 * viewer-side "signatures off" preference, because the theme's contract says
 * `signatureHtml: string | null` and a theme should render no container rather
 * than an empty one.
 *
 * A stale or missing render is rendered live, exactly as `postBodyHtml` does
 * it: the backfill exists so that stops being the common case, not so the read
 * path can depend on having run.
 */
export function signatureHtml(stored: StoredSignature): string | null {
  if (stored.locked) return null
  if (stored.signature.trim() === '') return null

  const format = stored.signatureFormat ?? BodyFormat.Markdown

  if (
    stored.signatureHtml !== null &&
    stored.signatureRenderVersion === RENDER_VERSION &&
    format === BodyFormat.Markdown
  ) {
    return stored.signatureHtml
  }

  return renderMarkdown(sourceAsMarkdown(stored.signature, format), SIGNATURE_RENDER_OPTIONS).html
}
