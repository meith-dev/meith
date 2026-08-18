import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import {
  BodyFormat,
  RENDER_VERSION,
  renderMarkdown,
  SIGNATURE_FEATURES,
  sourceAsMarkdown,
} from '@meith/markdown'

export const SIGNATURE_HARD_MAX = 1000

export const SIGNATURE_RENDER_OPTIONS = { features: SIGNATURE_FEATURES } as const

export interface SignatureLimits {
  readonly canUse: boolean
  readonly maxLength: number
}

export interface StoredSignature {
  readonly signature: string
  readonly signatureHtml: string | null
  readonly signatureRenderVersion: number
  readonly signatureFormat?: number
  readonly locked: boolean
  readonly lockedReason: string | null
}

export interface RenderedSignature {
  readonly html: string
  readonly version: number
}

export function signatureLimit(limits: SignatureLimits): number {
  if (limits.maxLength <= 0) return SIGNATURE_HARD_MAX
  return Math.min(limits.maxLength, SIGNATURE_HARD_MAX)
}

export function prepareSignature(
  raw: string,
  limits: SignatureLimits,
): { source: string; rendered: RenderedSignature } {
  if (!limits.canUse) {
    throw new ValidationError(msg('error.signatures.group-use-signature'))
  }

  const source = raw.trim()
  const limit = signatureLimit(limits)

  if (source.length > limit) {
    throw new ValidationError(msg('error.signatures.length', { max: limit, length: source.length }))
  }

  const rendered = renderMarkdown(source, SIGNATURE_RENDER_OPTIONS)
  return { source, rendered: { html: rendered.html, version: rendered.version } }
}

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
