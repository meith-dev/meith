import { msg } from '@meith/i18n'
import 'server-only'

import { ValidationError } from '@meith/core'
import { drivers } from '@meith/drivers'

export const IMAGE_SCHEMES = ['light', 'dark'] as const
export type ImageScheme = (typeof IMAGE_SCHEMES)[number]

export function isImageScheme(value: unknown): value is ImageScheme {
  return IMAGE_SCHEMES.includes(value as ImageScheme)
}

export const MAX_IMAGE_BYTES = 512 * 1024

export interface ImageFormat {
  readonly extension: string
  readonly contentType: string
}

export const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'

function startsAt(bytes: Uint8Array, offset: number, ...signature: number[]): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

export function sniff(bytes: Uint8Array): ImageFormat | null {
  if (startsAt(bytes, 0, 0x89, 0x50, 0x4e, 0x47)) {
    return { extension: 'png', contentType: 'image/png' }
  }
  if (startsAt(bytes, 0, 0xff, 0xd8, 0xff)) {
    return { extension: 'jpg', contentType: 'image/jpeg' }
  }
  if (startsAt(bytes, 0, 0x52, 0x49, 0x46, 0x46) && startsAt(bytes, 8, 0x57, 0x45, 0x42, 0x50)) {
    return { extension: 'webp', contentType: 'image/webp' }
  }
  if (isSvg(bytes)) return { extension: 'svg', contentType: 'image/svg+xml' }

  return null
}

const DANGEROUS_TAG = /<\s*(script|foreignobject|iframe|embed|object|set|animate\w*)\b/i
const EVENT_HANDLER_OR_SCRIPT_SCHEME = /\son\w+\s*=|javascript:|vbscript:/i
const REFERENCING_TAG = /<\s*(use|image|feimage)\b([^>]*)>/gi
const HREF_ATTRIBUTE = /(?:xlink:href|href)\s*=\s*(\x22|\x27)([\s\S]*?)\1/i

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X'
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
    return named[entity.toLowerCase()] ?? match
  })
}

function hasExternalReference(decoded: string): boolean {
  for (const match of decoded.matchAll(REFERENCING_TAG)) {
    const href = HREF_ATTRIBUTE.exec(match[2] ?? '')?.[2]?.trim()
    if (href !== undefined && href !== '' && !href.startsWith('#')) return true
  }
  return false
}

function isSvg(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const head = decoder
    .decode(bytes.slice(0, 4096))
    .replace(/^\uFEFF/, '')
    .trimStart()

  const looksSvg = head.startsWith('<svg') || /^<\?xml[\s\S]{0,512}?<svg/i.test(head)
  if (!looksSvg) return false

  const decoded = decodeEntities(decoder.decode(bytes))

  if (DANGEROUS_TAG.test(decoded) || EVENT_HANDLER_OR_SCRIPT_SCHEME.test(decoded)) {
    throw new ValidationError(msg('error.app.svg-contains-script-event-handler'))
  }
  if (hasExternalReference(decoded)) {
    throw new ValidationError(msg('error.app.svg-contains-external-reference'))
  }
  return true
}

export async function storeImage(prefix: string, name: string, file: File): Promise<string> {
  if (file.size === 0) throw new ValidationError(msg('error.app.choose-image-first'))
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ValidationError(
      `That image is ${Math.ceil(file.size / 1024)} KiB. The limit is ` +
        `${MAX_IMAGE_BYTES / 1024} KiB — it is displayed a few dozen pixels tall, ` +
        'so it does not need to be large.',
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const format = sniff(bytes)
  if (format === null) {
    throw new ValidationError(msg('error.app.file-png-jpeg-webp-svg'))
  }

  const key = `${prefix}/${name}-${crypto.randomUUID()}.${format.extension}`
  await drivers().files.put(key, bytes, {
    contentType: format.contentType,
    visibility: 'public',
  })

  return key
}

export async function forgetImage(key: string | null): Promise<void> {
  if (key === null || key === '') return
  await drivers()
    .files.delete(key)
    .catch(() => {})
}

export function contentTypeFor(key: string): string {
  return CONTENT_TYPE_BY_EXTENSION[key.split('.').pop() ?? ''] ?? 'application/octet-stream'
}

export function imageHeaders(key: string, byteLength: number): HeadersInit {
  return {
    'Content-Type': contentTypeFor(key),
    'Content-Length': String(byteLength),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
}
