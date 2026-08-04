/**
 * `@meith/signatures` — F58's signature half.
 *
 * A signature is member-written BBCode shown under every post they have ever
 * made. That last clause is the whole feature: it multiplies one member's text
 * across the board's heaviest pages, so it needs a **narrower tag set**, a
 * **length limit that is a group permission**, and a way for a moderator to
 * **stop it** without deleting what was there.
 *
 * ## Why a restricted registry rather than a validator
 *
 * The obvious implementation refuses a signature containing `[img]`. The one
 * here renders it with a tag registry that has no `img` in it, so the tag comes
 * out as literal text. That is better for two reasons: it cannot be bypassed by
 * a tag this build does not know about, and it degrades — a member who pastes
 * their old MyBB signature gets most of it rather than a refusal.
 *
 * F37's custom tags arrive through `ParseOptions.tags`, so this is the seam
 * being used as designed rather than a special case cut into the renderer.
 *
 * ## The avatar half is not here
 *
 * F58 also asks for avatars. An avatar is an upload (F42), and a *remote* URL
 * is not a safe substitute — see `docs/deviations.md` D61. Omitted rather than
 * half-built, per D32.
 */
import { RENDER_VERSION, TAGS, renderBBCode, type TagSpec } from '@meith/bbcode'
import { ValidationError } from '@meith/core'

/** The hard ceiling, whatever a group's `maxSignatureLength` says. */
export const SIGNATURE_HARD_MAX = 1000

/**
 * The tags a signature may use.
 *
 * Text styling and links, and nothing that changes the size of the page. What
 * is left out is the list, and each omission is the same argument: a signature
 * repeats on every post.
 *
 *   - **`img`** — an image per post is what makes a thread page unreadable, and
 *     a remote one is a tracking beacon that reports every reader's IP address
 *     to whoever hosts it. The same objection D61 makes about remote avatars.
 *   - **`quote`** — a quote block inside a signature is a quote of nothing.
 *   - **`size`** — the point of a size tag in a signature is to be bigger than
 *     everybody else's.
 *   - **`code`** — a preformatted block in a signature is a wall.
 *   - **`list`** — same.
 */
export const SIGNATURE_TAG_NAMES: readonly string[] = ['b', 'i', 'u', 's', 'color', 'url', 'email']

export const SIGNATURE_TAGS: Readonly<Record<string, TagSpec>> = Object.fromEntries(
  SIGNATURE_TAG_NAMES.filter((name) => name in TAGS).map((name) => [
    name,
    TAGS[name] as TagSpec,
  ]),
)

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
 * member types BBCode and a limit they cannot count against is one they cannot
 * work with. It also means a renderer change can never retroactively push
 * somebody over.
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

  const rendered = renderBBCode(source, { tags: SIGNATURE_TAGS })
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

  if (
    stored.signatureHtml !== null &&
    stored.signatureRenderVersion === RENDER_VERSION
  ) {
    return stored.signatureHtml
  }

  return renderBBCode(stored.signature, { tags: SIGNATURE_TAGS }).html
}
