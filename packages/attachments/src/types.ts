/**
 * What the board will accept, and how it knows.
 *
 * The list is short on purpose. **A format is on it only if the board can make
 * a claim about the bytes it serves**, and there are exactly two kinds of claim
 * available:
 *
 *  - *re-encoded* — the file was decoded to raw pixels and written back out by
 *    an encoder, so nothing of the original survives (ADR 0003). PNG and JPEG.
 *  - *opaque* — the board does not parse the format and does not pretend to. It
 *    is served with `Content-Disposition: attachment` and `nosniff` and is
 *    never rendered inline. PDF and ZIP.
 *
 * Everything else is refused rather than accepted with a shrug. `text/plain`
 * is the instructive omission: it has no signature at all, so "is this a text
 * file" can only ever be a guess, and this whole module exists because a guess
 * about file contents is what attackers rely on. GIF is refused for a different
 * reason — the codecs cannot re-encode it, and an animated GIF silently reduced
 * to one frame is worse than a refusal.
 *
 * F71 owns making this configurable per forum. Until then it is a constant,
 * which is the honest state: a board cannot be given a switch for a format
 * nothing can process.
 */

/** How a stored file is served. */
export type AttachmentHandling = 'reencode' | 'opaque'

export interface AttachmentType {
  /** The canonical type. This, never what the browser said. */
  readonly contentType: string
  /** The first is canonical; the rest are accepted spellings. */
  readonly extensions: readonly string[]
  /** Byte prefixes, any of which identifies the format. */
  readonly magic: readonly (readonly number[])[]
  readonly handling: AttachmentHandling
  /** Which codec decodes it, for the re-encoded kinds. */
  readonly codec: 'png' | 'jpeg' | null
  /** Whether the postbit may show it inline. */
  readonly inline: boolean
}

export const ATTACHMENT_TYPES: readonly AttachmentType[] = [
  {
    contentType: 'image/png',
    extensions: ['png'],
    /* The 8-byte PNG signature. The CR/LF/EOF bytes in it exist to catch
       transfers that mangled line endings, and checking all eight is free. */
    magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    handling: 'reencode',
    codec: 'png',
    inline: true,
  },
  {
    contentType: 'image/jpeg',
    extensions: ['jpg', 'jpeg', 'jpe'],
    /* SOI followed by the first marker. `FF D8` alone is two bytes and matches
       far too much. */
    magic: [[0xff, 0xd8, 0xff]],
    handling: 'reencode',
    codec: 'jpeg',
    inline: true,
  },
  {
    contentType: 'application/pdf',
    extensions: ['pdf'],
    magic: [[0x25, 0x50, 0x44, 0x46, 0x2d]], // "%PDF-"
    handling: 'opaque',
    codec: null,
    inline: false,
  },
  {
    contentType: 'application/zip',
    extensions: ['zip'],
    /* Local file header, end-of-central-directory (an empty archive), and the
       spanned marker. An archive that starts with none of these is not one this
       board will store. */
    magic: [
      [0x50, 0x4b, 0x03, 0x04],
      [0x50, 0x4b, 0x05, 0x06],
      [0x50, 0x4b, 0x07, 0x08],
    ],
    handling: 'opaque',
    codec: null,
    inline: false,
  },
] as const

/** The longest signature, so a caller knows how few bytes it needs to read. */
export const MAGIC_BYTES_NEEDED = ATTACHMENT_TYPES.reduce(
  (most, type) => Math.max(most, ...type.magic.map((m) => m.length)),
  0,
)

/**
 * The format these bytes actually are, or undefined.
 *
 * Deliberately takes the *content* and nothing else. The filename and the
 * browser's `Content-Type` are both supplied by whoever is uploading, and a
 * function that accepted them would eventually be asked to trust one.
 */
export function sniff(bytes: Uint8Array): AttachmentType | undefined {
  return ATTACHMENT_TYPES.find((type) =>
    type.magic.some(
      (signature) =>
        bytes.length >= signature.length &&
        signature.every((byte, at) => bytes[at] === byte),
    ),
  )
}

/** The type record for a canonical content type, or undefined. */
export function attachmentType(contentType: string): AttachmentType | undefined {
  return ATTACHMENT_TYPES.find((type) => type.contentType === contentType)
}

/** Every extension the board accepts, for the file input's `accept`. */
export const ACCEPTED_EXTENSIONS: readonly string[] = ATTACHMENT_TYPES.flatMap(
  (type) => type.extensions,
)

/**
 * The form field both composers use for their file input.
 *
 * Here rather than in the app because the client component that renders the
 * input and the Server Action that reads it must agree, and importing the
 * action's module into the browser bundle pulls the whole server container with
 * it — which is what happened, and what `server-only` caught.
 */
export const ATTACHMENT_FIELD = 'attachments'

/** The status of an attachment row. */
export type AttachmentStatus = 'pending' | 'ready' | 'failed'

/** An attachment as stored. */
export interface AttachmentRecord {
  readonly id: number
  readonly postId: number
  readonly forumId: number
  readonly uploaderUserId: number | null
  readonly filename: string
  readonly contentType: string
  readonly sizeBytes: number
  readonly storageKey: string | null
  readonly sourceKey: string | null
  readonly thumbnailKey: string | null
  readonly width: number | null
  readonly height: number | null
  readonly status: AttachmentStatus
  readonly failureReason: string | null
  readonly downloadCount: number
  readonly createdAt: Date
}

/** A file offered for upload, decoupled from the web `File` type. */
export interface IncomingFile {
  readonly filename: string
  readonly bytes: Uint8Array
}

/** A validated upload, ready to be stored. */
export interface AcceptedUpload {
  readonly filename: string
  readonly type: AttachmentType
  readonly bytes: Uint8Array
}
