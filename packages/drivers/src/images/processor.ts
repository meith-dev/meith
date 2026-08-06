import {
  MAX_IMAGE,
  THUMBNAIL,
  type ImageProcessor,
  type ProcessedImage,
} from '@meith/attachments'

import { decodeImage, encodeImage, resizeToFit } from './codec'

const ATTACHMENT_QUALITY = 85

const THUMBNAIL_QUALITY = 70

function toBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer)
}

export const imageProcessor: ImageProcessor = {
  async process(input) {
    const decoded = await decodeImage(
      input.bytes.slice().buffer as ArrayBuffer,
      input.codec,
    )

    const fitted = await resizeToFit(decoded, input.fit ?? MAX_IMAGE)
    const bytes = toBytes(await encodeImage(fitted, input.codec, ATTACHMENT_QUALITY))

    const wantsThumbnail = input.thumbnail ?? true
    const preview = wantsThumbnail ? await resizeToFit(fitted, THUMBNAIL) : fitted

    const processed: ProcessedImage = {
      bytes,
      contentType: input.codec === 'png' ? 'image/png' : 'image/jpeg',
      width: fitted.width,
      height: fitted.height,
      ...(preview === fitted
        ? {}
        : {
            thumbnail: {
              bytes: toBytes(await encodeImage(preview, 'jpeg', THUMBNAIL_QUALITY)),
              contentType: 'image/jpeg',
            },
          }),
    }

    return processed
  },
}
