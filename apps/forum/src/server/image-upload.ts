import 'server-only'

/**
 * Accepting an image from an administrator, and storing it.
 *
 * Extracted from the board logo when group badges needed the same thing.
 * Sharing it is not tidiness: this is where the board decides what an uploaded
 * file *is*, and two copies of that decision is two chances for one of them to
 * accept something the other refuses — with the difference showing up as a
 * stored object nothing will serve, or worse.
 *
 * ## Why this is not the avatar pipeline
 *
 * F58's avatars take an upload, queue a job, re-encode it through the wasm
 * codecs and track a pending state, because a member's avatar is untrusted
 * input arriving at whatever rate a board's membership feels like. These are
 * uploaded by an administrator, rarely, on a screen behind `requireAdmin`. The
 * queue, the pending state and the grace period would be machinery answering
 * questions this does not have.
 *
 * What it keeps from that pipeline is every part that is about *safety*: the
 * bytes are sniffed rather than trusted, the declared content type is ignored,
 * and the stored key is random rather than derived from the filename.
 *
 * ## Why the bytes decide the format
 *
 * A browser sends whatever `Content-Type` the operating system guessed from
 * the extension, and an attacker sends whatever they like. Neither is evidence.
 * `sniff` reads the magic bytes, and a file whose signature is not one of the
 * four formats below is refused — including the case that matters most, which
 * is markup with a `.png` on the end.
 *
 * SVG is the exception and needs its own argument, because it is the format an
 * operator most wants for a wordmark or a badge and the only one that can
 * contain script. It is accepted, and three things make that safe rather than
 * optimistic:
 *
 *  1. it is rendered through `<img>`, and an SVG in an `<img>` cannot run
 *     script, load external resources or reach the embedding page — that is a
 *     rule of the image context, not a mitigation this code applies;
 *  2. the serving routes send `Content-Security-Policy: default-src 'none';
 *     sandbox` and `X-Content-Type-Options: nosniff`, so navigating *directly*
 *     to the file cannot execute anything either;
 *  3. the markup is checked for the constructs that would matter if either of
 *     those ever stopped holding.
 *
 * Any one of the three would probably do. Depending on one of them would mean
 * this file has an opinion about which, and it does not.
 */
import { ValidationError } from '@meith/core'
import { drivers } from '@meith/drivers'

/** Both uploads this board has. Two images each, for the same reason. */
export const IMAGE_SCHEMES = ['light', 'dark'] as const
export type ImageScheme = (typeof IMAGE_SCHEMES)[number]

export function isImageScheme(value: unknown): value is ImageScheme {
  return IMAGE_SCHEMES.includes(value as ImageScheme)
}

/**
 * 512 KiB.
 *
 * A header logo is displayed at about 32 pixels tall and a badge at about 16.
 * Half a megabyte is already an order of magnitude more than either needs and
 * is small enough that a mistake — somebody uploading a photograph — is
 * refused rather than served to every visitor on every page.
 */
export const MAX_IMAGE_BYTES = 512 * 1024

/** What the board will serve this as, which is not what the browser claimed. */
export interface ImageFormat {
  readonly extension: string
  readonly contentType: string
}

/** The four this board stores, and therefore the four it serves. */
export const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

/** What an `accept` attribute should offer, so the file picker agrees. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'

function startsAt(bytes: Uint8Array, offset: number, ...signature: number[]): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * Identify a format from the leading bytes, or refuse.
 *
 * Throws only for an SVG this board will not serve — a refusal an operator can
 * act on. Everything else it simply does not recognise, and the caller turns
 * that into one message.
 */
export function sniff(bytes: Uint8Array): ImageFormat | null {
  if (startsAt(bytes, 0, 0x89, 0x50, 0x4e, 0x47)) {
    return { extension: 'png', contentType: 'image/png' }
  }
  if (startsAt(bytes, 0, 0xff, 0xd8, 0xff)) {
    return { extension: 'jpg', contentType: 'image/jpeg' }
  }
  /* RIFF is a container — a WAV starts the same way, so the tag decides. */
  if (startsAt(bytes, 0, 0x52, 0x49, 0x46, 0x46) && startsAt(bytes, 8, 0x57, 0x45, 0x42, 0x50)) {
    return { extension: 'webp', contentType: 'image/webp' }
  }
  if (isSvg(bytes)) return { extension: 'svg', contentType: 'image/svg+xml' }

  return null
}

/**
 * Is this SVG, and is it SVG this board is willing to serve?
 *
 * The text is decoded and asked two questions. The first is whether it is SVG
 * at all — a leading `<svg` or an XML declaration followed by one, allowing for
 * a byte-order mark and leading whitespace, because real files have both.
 *
 * The second is whether it carries anything that would matter in a context
 * where SVG *is* live markup. That check is deliberately crude — it is the
 * third of three defences, not the only one, and a sanitiser thorough enough to
 * be the only one is a project rather than a function.
 */
function isSvg(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder('utf-8', { fatal: false })
  /*
   * `\uFEFF` written as an escape, not as the character. A literal byte-order
   * mark in source is invisible in every editor, diff and review — the same
   * argument the `no-raw-control-characters` guard makes, and the reason
   * ESLint's `no-irregular-whitespace` is on.
   */
  const head = decoder.decode(bytes.slice(0, 4096)).replace(/^\uFEFF/, '').trimStart()

  const looksSvg = head.startsWith('<svg') || /^<\?xml[\s\S]{0,512}?<svg/i.test(head)
  if (!looksSvg) return false

  if (/<script|<foreignObject|\son\w+\s*=|javascript:/i.test(decoder.decode(bytes))) {
    throw new ValidationError(
      'That SVG contains script or an event handler, so it will not be stored. ' +
        'Export it again without interactivity, or upload a PNG.',
    )
  }
  return true
}

/**
 * Validate an upload and put it in the store, returning its key.
 *
 * The key carries a UUID minted here, which is what lets every serving route
 * send a long `immutable` cache header: replacing an image produces a different
 * key, so a URL built from it is a different URL and nothing has to expire.
 *
 * @param prefix - where in the store this kind of image lives, e.g. `board` or
 * `group/12`. Composed by the caller, never by the uploader.
 */
export async function storeImage(prefix: string, name: string, file: File): Promise<string> {
  if (file.size === 0) throw new ValidationError('Choose an image first.')
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
    throw new ValidationError(
      'That file is not a PNG, JPEG, WebP or SVG. The name is not what decides ' +
        'this — the contents are.',
    )
  }

  const key = `${prefix}/${name}-${crypto.randomUUID()}.${format.extension}`
  await drivers().files.put(key, bytes, {
    contentType: format.contentType,
    visibility: 'public',
  })

  return key
}

/**
 * Forget an object the board has stopped pointing at.
 *
 * Never fatal. A leaked object costs disk; a delete that took a page down would
 * cost the page — and the order every caller uses is "write the new pointer,
 * then drop the old object", so by the time this runs the board is already
 * correct.
 */
export async function forgetImage(key: string | null): Promise<void> {
  if (key === null || key === '') return
  await drivers().files.delete(key).catch(() => {})
}

/** The content type to serve a stored key as, from its own extension. */
export function contentTypeFor(key: string): string {
  return CONTENT_TYPE_BY_EXTENSION[key.split('.').pop() ?? ''] ?? 'application/octet-stream'
}

/**
 * Headers every stored image is served with.
 *
 * The `nosniff`/`sandbox` pair matters most for SVG: it means a reader who
 * navigates straight to the file gets a document that can run nothing and fetch
 * nothing. `immutable` is safe because the URL carries the key's UUID, so it
 * changes whenever the image does.
 */
export function imageHeaders(key: string, byteLength: number): HeadersInit {
  return {
    'Content-Type': contentTypeFor(key),
    'Content-Length': String(byteLength),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
}
