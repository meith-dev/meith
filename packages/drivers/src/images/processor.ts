/**
 * F42's `ImageProcessor`, over the codecs.
 *
 * The port lives in `@meith/attachments` so that package — and everything that
 * merely *reads* an attachment — can be built and tested without ~630 KB of
 * WebAssembly. This is the one implementation, and it is imported only by
 * whatever registers the processing job.
 *
 * ## What it decides
 *
 * **The output format follows the input.** A PNG stays a PNG and a JPEG stays a
 * JPEG. Converting a screenshot's flat colour to JPEG makes it larger and
 * blurrier, and converting a photograph to PNG makes it enormous; neither is a
 * decision to make on somebody's behalf without knowing which they uploaded.
 *
 * **The thumbnail is always JPEG.** It is a small lossy preview by definition,
 * and a PNG thumbnail of a photograph is routinely bigger than the JPEG it
 * previews.
 *
 * **A small image gets no thumbnail.** `resizeToFit` returns the original
 * object unchanged when it already fits, so the check is "did anything change"
 * rather than a second size comparison that could disagree with it.
 */
import {
  MAX_IMAGE,
  THUMBNAIL,
  type ImageProcessor,
  type ProcessedImage,
} from '@meith/attachments'

import { decodeImage, encodeImage, resizeToFit } from './codec'

/** JPEG quality for a stored attachment. High enough that a re-encode of a
    photograph is not visibly worse than what was uploaded. */
const ATTACHMENT_QUALITY = 85

/** And for a 320px preview, where nobody is looking for artefacts. */
const THUMBNAIL_QUALITY = 70

function toBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer)
}

export const imageProcessor: ImageProcessor = {
  async process(input) {
    const decoded = await decodeImage(
      /*
       * A fresh buffer rather than `input.bytes.buffer`: a Uint8Array may be a
       * view into a larger pool (which is exactly what Node's file reads
       * produce), and handing the whole pool to a decoder would have it read
       * bytes belonging to something else.
       */
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
      /*
       * Identity means it already fitted, so there is nothing a thumbnail would
       * save. Comparing the object rather than the dimensions keeps this in
       * step with `resizeToFit` by construction — and covers the
       * `thumbnail: false` case without a second branch.
       */
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
