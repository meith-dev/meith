/**
 * F42 — decoding, re-encoding and resizing an uploaded image.
 *
 * Confined to its own entry point (`@forum/drivers/images`) and reached only
 * from the attachment path, exactly as ADR 0002 confines the S3 client: a board
 * that never accepts an image never compiles a codec. See ADR 0003 for why
 * `@jsquash` and not the alternatives.
 *
 * ## The `.wasm` is always loaded by us, never by the package
 *
 * Every codec here is initialised with a module **we** compiled from bytes we
 * read off disk. The packages can load their own `.wasm` — with
 * `fetch(new URL('….wasm', import.meta.url))` — and that path is unusable on a
 * Node server, in both directions:
 *
 *  - unbundled, `import.meta.url` is a real `file:` URL and Node's `fetch`
 *    refuses it (`TypeError: fetch failed`, cause `not implemented... yet...`);
 *  - bundled, `import.meta.url` is the literal string `"unknown"`.
 *
 * There is therefore no configuration in which letting the package load itself
 * works, which is why `initialise()` has no fallback: a resolution failure
 * throws, with a message naming the file. The alternative — try ours, fall back
 * to theirs — passes its tests and then answers `fetch failed` in production,
 * which is the shape of bug D54 exists to record.
 *
 * `locate-wasm.ts` is how the path is found in every runtime this board has,
 * including the Next standalone output.
 */
import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode.js'
import encodeJpeg, { init as initJpegEncode } from '@jsquash/jpeg/encode.js'
import decodePng, { init as initPngDecode } from '@jsquash/png/decode.js'
import encodePng, { init as initPngEncode } from '@jsquash/png/encode.js'
import resizeImage, { initResize } from '@jsquash/resize'

import { compileAsset } from './locate-wasm'

/** Where each codec's module lives inside its package. */
const WASM = {
  png: '@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  jpegDecode: '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
  jpegEncode: '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
  resize: '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm',
} as const

/** Compiled once per process — ~120ms for all four, then free. */
let ready: Promise<void> | null = null

async function initOne(
  init: (module: WebAssembly.Module) => Promise<unknown>,
  specifier: string,
): Promise<void> {
  await init(await compileAsset(specifier))
}

function initialise(): Promise<void> {
  ready ??= (async () => {
    /*
     * The resizer's `initResize` is the one that is easy to miss: `resize()`
     * initialises itself lazily through the failing `fetch` path, so omitting
     * it is silent until the first thumbnail. Only the *default* resize method
     * is used — `hqx` and `magicKernel` each carry another module to forget.
     */
    await Promise.all([
      initOne(initPngDecode, WASM.png),
      initOne(initPngEncode, WASM.png),
      initOne(initJpegDecode, WASM.jpegDecode),
      initOne(initJpegEncode, WASM.jpegEncode),
      initOne(initResize, WASM.resize),
    ])
  })().catch((error: unknown) => {
    /* A failed init must not be cached as done: the next call retries. */
    ready = null
    throw error
  })
  return ready
}

/**
 * A decoded image.
 *
 * Structurally `ImageData`, `colorSpace` included — the codecs' types require
 * it and Node has no global `ImageData` constructor, so it is carried
 * explicitly rather than reconstructed at each call site.
 */
export interface DecodedImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
  readonly colorSpace: PredefinedColorSpace
}

/** The formats this board will re-encode to. */
export type ImageFormat = 'png' | 'jpeg'

/** Decode a PNG or JPEG. Throws on anything that is not one. */
export async function decodeImage(
  bytes: ArrayBuffer,
  format: ImageFormat,
): Promise<DecodedImage> {
  await initialise()
  return format === 'png' ? decodePng(bytes) : decodeJpeg(bytes)
}

/**
 * Re-encode from raw pixels.
 *
 * This is the point of the whole exercise: the output is written by the encoder
 * from the decoded bitmap, so **nothing of the original file survives** — no
 * EXIF, no colour profile, no trailing archive, no polyglot payload. Validating
 * a file tells you it claims to be an image; re-encoding it makes it one.
 */
export async function encodeImage(
  image: DecodedImage,
  format: ImageFormat,
  quality = 82,
): Promise<ArrayBuffer> {
  await initialise()
  return format === 'png' ? encodePng(image) : encodeJpeg(image, { quality })
}

/** Scale to fit inside a box, preserving aspect ratio. Never scales up. */
export async function resizeToFit(
  image: DecodedImage,
  max: { readonly width: number; readonly height: number },
): Promise<DecodedImage> {
  await initialise()
  const scale = Math.min(max.width / image.width, max.height / image.height, 1)
  if (scale >= 1) return image

  return resizeImage(image, {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  })
}
