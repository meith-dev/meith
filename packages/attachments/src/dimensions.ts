import type { AttachmentType } from './types'

export interface Dimensions {
  readonly width: number
  readonly height: number
}

function readUint32BE(bytes: Uint8Array, at: number): number | undefined {
  if (at + 4 > bytes.length) return undefined
  return (
    ((bytes[at] as number) << 24) |
    ((bytes[at + 1] as number) << 16) |
    ((bytes[at + 2] as number) << 8) |
    (bytes[at + 3] as number)
  ) >>> 0
}

function readUint16BE(bytes: Uint8Array, at: number): number | undefined {
  if (at + 2 > bytes.length) return undefined
  return ((bytes[at] as number) << 8) | (bytes[at + 1] as number)
}

function pngDimensions(bytes: Uint8Array): Dimensions | undefined {
  const isIhdr =
    bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52
  if (!isIhdr) return undefined

  const width = readUint32BE(bytes, 16)
  const height = readUint32BE(bytes, 20)
  if (width === undefined || height === undefined) return undefined
  if (width === 0 || height === 0) return undefined
  return { width, height }
}

const JPEG_START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

function jpegDimensions(bytes: Uint8Array): Dimensions | undefined {
  let at = 2

  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined

    const marker = bytes[at + 1] as number
    if (marker === 0xff) {
      at += 1
      continue
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2
      continue
    }

    const length = readUint16BE(bytes, at + 2)
    if (length === undefined || length < 2) return undefined

    if (JPEG_START_OF_FRAME.has(marker)) {
      const height = readUint16BE(bytes, at + 5)
      const width = readUint16BE(bytes, at + 7)
      if (width === undefined || height === undefined) return undefined
      if (width === 0 || height === 0) return undefined
      return { width, height }
    }

    at += 2 + length
  }

  return undefined
}

export function declaredDimensions(
  bytes: Uint8Array,
  type: AttachmentType,
): Dimensions | undefined {
  switch (type.codec) {
    case 'png':
      return pngDimensions(bytes)
    case 'jpeg':
      return jpegDimensions(bytes)
    default:
      return undefined
  }
}
