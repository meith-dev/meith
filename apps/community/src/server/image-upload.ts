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

function isSvg(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const head = decoder
    .decode(bytes.slice(0, 4096))
    .replace(/^\uFEFF/, '')
    .trimStart()

  const looksSvg = head.startsWith('<svg') || /^<\?xml[\s\S]{0,512}?<svg/i.test(head)
  if (!looksSvg) return false

  if (/<script|<foreignObject|\son\w+\s*=|javascript:/i.test(decoder.decode(bytes))) {
    throw new ValidationError(msg('error.app.svg-contains-script-event-handler'))
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
