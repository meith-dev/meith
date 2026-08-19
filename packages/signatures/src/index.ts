import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import {
  authorRef,
  BodyFormat,
  CORE_RENDERING,
  type MarkdownPipeline,
  RENDER_VERSION,
  renderMarkdown,
  renderThrough,
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

export async function prepareSignature(
  raw: string,
  limits: SignatureLimits,
  options: { readonly authorId: number; readonly rendering?: MarkdownPipeline },
): Promise<{ source: string; rendered: RenderedSignature }> {
  if (!limits.canUse) {
    throw new ValidationError(msg('error.signatures.group-use-signature'))
  }

  const source = raw.trim()
  const limit = signatureLimit(limits)

  if (source.length > limit) {
    throw new ValidationError(msg('error.signatures.length', { max: limit, length: source.length }))
  }

  const rendered = await renderThrough(
    options.rendering ?? CORE_RENDERING,
    source,
    { source: 'signature', viewer: authorRef(options.authorId) },
    SIGNATURE_RENDER_OPTIONS,
  )
  return { source, rendered: { html: rendered.html, version: rendered.version } }
}

export async function renderStoredSignature(
  stored: StoredSignature,
  options: { readonly authorId: number; readonly rendering?: MarkdownPipeline },
): Promise<string | null> {
  if (!storedSignatureRenders(stored)) return null
  if (storedSignatureIsCurrent(stored)) return stored.signatureHtml

  const rendered = await renderThrough(
    options.rendering ?? CORE_RENDERING,
    sourceAsMarkdown(stored.signature, stored.signatureFormat ?? BodyFormat.Markdown),
    { source: 'signature', viewer: authorRef(options.authorId) },
    SIGNATURE_RENDER_OPTIONS,
  )
  return rendered.html
}

function storedSignatureRenders(stored: StoredSignature): boolean {
  return !stored.locked && stored.signature.trim() !== ''
}

function storedSignatureIsCurrent(stored: StoredSignature): stored is StoredSignature & {
  signatureHtml: string
} {
  return (
    stored.signatureHtml !== null &&
    stored.signatureRenderVersion === RENDER_VERSION &&
    (stored.signatureFormat ?? BodyFormat.Markdown) === BodyFormat.Markdown
  )
}

export function signatureHtml(stored: StoredSignature): string | null {
  if (!storedSignatureRenders(stored)) return null
  if (storedSignatureIsCurrent(stored)) return stored.signatureHtml

  return renderMarkdown(
    sourceAsMarkdown(stored.signature, stored.signatureFormat ?? BodyFormat.Markdown),
    SIGNATURE_RENDER_OPTIONS,
  ).html
}
