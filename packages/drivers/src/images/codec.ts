import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode.js'
import encodeJpeg, { init as initJpegEncode } from '@jsquash/jpeg/encode.js'
import decodePng, { init as initPngDecode } from '@jsquash/png/decode.js'
import encodePng, { init as initPngEncode } from '@jsquash/png/encode.js'
import resizeImage, { initResize } from '@jsquash/resize'

import { compileAsset } from './locate-wasm'

const WASM = {
  png: '@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  jpegDecode: '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
  jpegEncode: '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
  resize: '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm',
} as const

let ready: Promise<void> | null = null

async function initOne(
  init: (module: WebAssembly.Module) => Promise<unknown>,
  specifier: string,
): Promise<void> {
  await init(await compileAsset(specifier))
}

function initialise(): Promise<void> {
  ready ??= (async () => {
    await Promise.all([
      initOne(initPngDecode, WASM.png),
      initOne(initPngEncode, WASM.png),
      initOne(initJpegDecode, WASM.jpegDecode),
      initOne(initJpegEncode, WASM.jpegEncode),
      initOne(initResize, WASM.resize),
    ])
  })().catch((error: unknown) => {
    ready = null
    throw error
  })
  return ready
}

export interface DecodedImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
  readonly colorSpace: PredefinedColorSpace
}

export type ImageFormat = 'png' | 'jpeg'

export async function decodeImage(bytes: ArrayBuffer, format: ImageFormat): Promise<DecodedImage> {
  await initialise()
  return format === 'png' ? decodePng(bytes) : decodeJpeg(bytes)
}

export async function encodeImage(
  image: DecodedImage,
  format: ImageFormat,
  quality = 82,
): Promise<ArrayBuffer> {
  await initialise()
  return format === 'png' ? encodePng(image) : encodeJpeg(image, { quality })
}

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
