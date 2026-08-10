export type AttachmentHandling = 'reencode' | 'opaque'

export interface AttachmentType {
  readonly contentType: string
  readonly extensions: readonly string[]
  readonly magic: readonly (readonly number[])[]
  readonly handling: AttachmentHandling
  readonly codec: 'png' | 'jpeg' | null
  readonly inline: boolean
}

export const ATTACHMENT_TYPES: readonly AttachmentType[] = [
  {
    contentType: 'image/png',
    extensions: ['png'],
    magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    handling: 'reencode',
    codec: 'png',
    inline: true,
  },
  {
    contentType: 'image/jpeg',
    extensions: ['jpg', 'jpeg', 'jpe'],
    magic: [[0xff, 0xd8, 0xff]],
    handling: 'reencode',
    codec: 'jpeg',
    inline: true,
  },
  {
    contentType: 'application/pdf',
    extensions: ['pdf'],
    magic: [[0x25, 0x50, 0x44, 0x46, 0x2d]],
    handling: 'opaque',
    codec: null,
    inline: false,
  },
  {
    contentType: 'application/zip',
    extensions: ['zip'],
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

export const MAGIC_BYTES_NEEDED = ATTACHMENT_TYPES.reduce(
  (most, type) => Math.max(most, ...type.magic.map((m) => m.length)),
  0,
)

export function sniff(bytes: Uint8Array): AttachmentType | undefined {
  return ATTACHMENT_TYPES.find((type) =>
    type.magic.some(
      (signature) =>
        bytes.length >= signature.length &&
        signature.every((byte, at) => bytes[at] === byte),
    ),
  )
}

export function attachmentType(contentType: string): AttachmentType | undefined {
  return ATTACHMENT_TYPES.find((type) => type.contentType === contentType)
}

export const ACCEPTED_EXTENSIONS: readonly string[] = ATTACHMENT_TYPES.flatMap(
  (type) => type.extensions,
)

export const ATTACHMENT_FIELD = 'attachments'

export type AttachmentStatus = 'pending' | 'ready' | 'failed'

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

export interface IncomingFile {
  readonly filename: string
  readonly bytes: Uint8Array
}

export interface AcceptedUpload {
  readonly filename: string
  readonly type: AttachmentType
  readonly bytes: Uint8Array
}
