/**
 * Reading an image's dimensions from its header, without decoding it.
 *
 * This exists for one reason: **a decoder must never be handed an image whose
 * size it has not agreed to.** A 30,000 × 30,000 PNG is about 90 KB on the wire
 * — it compresses beautifully, because it is one flat colour — and 3.6 GB once
 * decoded to RGBA. The upload passes every size check, and the process that
 * decodes it dies.
 *
 * That attack is old and has a name, and the defence is not "limit the file
 * size": the ratio between the two is unbounded. The defence is to read the
 * declared dimensions out of the header, which both formats put near the front
 * and neither compresses, and refuse before allocating anything.
 *
 * Both parsers are deliberately small and deliberately strict — they answer
 * "what does this file *say* it is" and nothing else. If a header is malformed
 * they return undefined, and the caller refuses the upload, because a file
 * whose dimensions cannot be read is a file whose decode cannot be bounded.
 */
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

/**
 * PNG: the IHDR chunk is required to be first, so width and height are always
 * at fixed offsets 16 and 20 — eight bytes of signature, four of length, four
 * of type. A file that puts something else there is not a PNG.
 */
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

/** The frame headers. Every one of them carries the size the same way. */
const JPEG_START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

/**
 * JPEG: walk the marker chain to the first Start Of Frame.
 *
 * Unlike PNG there is no fixed offset — EXIF, colour profiles and comments all
 * sit in front of the frame header, and each declares its own length. The walk
 * is therefore bounded by the segment lengths in the file, which is why it also
 * has to refuse a length that does not move forward: a segment claiming length
 * 0 or 1 would otherwise loop here forever on a file crafted to do exactly that.
 */
function jpegDimensions(bytes: Uint8Array): Dimensions | undefined {
  let at = 2 /* past SOI */

  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined

    const marker = bytes[at + 1] as number
    /* Padding: any run of FF bytes before a marker is legal. */
    if (marker === 0xff) {
      at += 1
      continue
    }
    /* Standalone markers, which carry no length. */
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2
      continue
    }

    const length = readUint16BE(bytes, at + 2)
    if (length === undefined || length < 2) return undefined

    if (JPEG_START_OF_FRAME.has(marker)) {
      /* length(2) precision(1) height(2) width(2) */
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

/**
 * What the file declares its size to be, or undefined if it cannot be read.
 *
 * Returns undefined for a format with no dimensions — a PDF is not an image and
 * has none — so callers must distinguish "not an image" from "an image whose
 * header is broken" by looking at the type, not at this.
 */
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
