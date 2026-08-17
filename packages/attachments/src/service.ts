import type { FileStore } from '@meith/core'
import { ValidationError } from '@meith/core'

import { declaredDimensions } from './dimensions'
import { sanitiseFilename, storageKeyFor } from './filename'
import { maxBytesFor, maxPerPostFor, type UploadLimits } from './limits'
import {
  type AcceptedUpload,
  type AttachmentRecord,
  type AttachmentType,
  type IncomingFile,
  MAGIC_BYTES_NEEDED,
  sniff,
} from './types'

export const MAX_MEGAPIXELS = 50

export const MAX_IMAGE = { width: 2000, height: 2000 } as const
export const THUMBNAIL = { width: 320, height: 320 } as const

export const THUMBNAIL_THRESHOLD = THUMBNAIL.width

export function acceptFile(file: IncomingFile, limits: UploadLimits): AcceptedUpload {
  const shown = file.filename.slice(0, 60)

  if (file.bytes.length === 0) {
    throw new ValidationError(`“${shown}” is empty.`)
  }

  const maxBytes = maxBytesFor(limits)
  if (file.bytes.length > maxBytes) {
    throw new ValidationError(
      `“${shown}” is ${describeSize(file.bytes.length)}, over the ${describeSize(maxBytes)} limit.`,
    )
  }

  if (file.bytes.length < MAGIC_BYTES_NEEDED) {
    throw new ValidationError(
      `“${shown}” is too short to be a file of any type this board accepts.`,
    )
  }

  const type = sniff(file.bytes)
  if (type === undefined) {
    throw new ValidationError(
      `“${shown}” is not a type this board accepts. Attachments may be PNG, JPEG, PDF or ZIP.`,
    )
  }

  if (type.codec !== null) {
    const size = declaredDimensions(file.bytes, type)
    if (size === undefined) {
      throw new ValidationError(`“${shown}” has a damaged header and cannot be read.`)
    }
    if ((size.width * size.height) / 1_000_000 > MAX_MEGAPIXELS) {
      throw new ValidationError(
        `“${shown}” is ${size.width}×${size.height}, over the ${MAX_MEGAPIXELS} megapixel limit.`,
      )
    }
  }

  return { filename: sanitiseFilename(file.filename, type), type, bytes: file.bytes }
}

export function acceptFiles(
  files: readonly IncomingFile[],
  limits: UploadLimits,
  existing = 0,
): readonly AcceptedUpload[] {
  const cap = maxPerPostFor(limits)
  if (existing + files.length > cap) {
    throw new ValidationError(`A post may have at most ${cap} attachment${cap === 1 ? '' : 's'}.`)
  }
  return files.map((file) => acceptFile(file, limits))
}

function describeSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export interface ProcessedImage {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly width: number
  readonly height: number
  readonly thumbnail?: {
    readonly bytes: Uint8Array
    readonly contentType: string
  }
}

export interface ImageProcessor {
  process(input: {
    readonly bytes: Uint8Array
    readonly codec: 'png' | 'jpeg'
    readonly fit?: { readonly width: number; readonly height: number }
    readonly thumbnail?: boolean
  }): Promise<ProcessedImage>
}

export interface CreateAttachmentInput {
  readonly postId: number
  readonly forumId: number
  readonly uploaderUserId: number
  readonly filename: string
  readonly contentType: string
  readonly sizeBytes: number
  readonly sourceKey: string | null
  readonly storageKey: string | null
  readonly status: 'pending' | 'ready'
}

export interface ReadyInput {
  readonly storageKey: string
  readonly thumbnailKey: string | null
  readonly width: number | null
  readonly height: number | null
  readonly sizeBytes: number
}

export interface AttachmentForDownload {
  readonly record: AttachmentRecord
  readonly postVisibility: string
  readonly threadVisibility: string
  readonly threadAuthorUserId: number | null
}

export interface AttachmentRepository {
  create(input: CreateAttachmentInput): Promise<AttachmentRecord>
  findById(id: number): Promise<AttachmentRecord | null>
  findForDownload(id: number): Promise<AttachmentForDownload | null>
  listForPosts(postIds: readonly number[]): Promise<readonly AttachmentRecord[]>
  countForPost(postId: number): Promise<number>
  markReady(id: number, input: ReadyInput): Promise<void>
  markFailed(id: number, reason: string): Promise<void>
  recordDownload(id: number): Promise<void>
  stalled(before: Date, limit: number): Promise<readonly AttachmentRecord[]>

  rememberKey(key: string): Promise<void>
  forgetKeys(keys: readonly string[]): Promise<void>
  staleKeys(before: Date, limit: number): Promise<readonly string[]>
}

export interface AttachmentServiceDeps {
  readonly attachments: AttachmentRepository
  readonly files: FileStore
  readonly images: ImageProcessor
  readonly random?: () => string
  readonly now?: () => Date
}

export const ORPHAN_GRACE_MINUTES = 60

export const PROCESSING_GRACE_MINUTES = 30

export class AttachmentService {
  private readonly deps: AttachmentServiceDeps
  private readonly random: () => string
  private readonly now: () => Date

  constructor(deps: AttachmentServiceDeps) {
    this.deps = deps
    this.random = deps.random ?? defaultRandom
    this.now = deps.now ?? (() => new Date())
  }

  async stage(uploads: readonly AcceptedUpload[]): Promise<readonly StagedUpload[]> {
    const staged: StagedUpload[] = []
    for (const upload of uploads) {
      const opaque = upload.type.handling === 'opaque'
      const key = storageKeyFor(opaque ? 'file' : 'source', this.random)

      await this.deps.attachments.rememberKey(key)
      await this.deps.files.put(key, upload.bytes, {
        contentType: upload.type.contentType,
        visibility: 'private',
      })

      staged.push({ upload, key, opaque })
    }
    return staged
  }

  async attach(
    staged: readonly StagedUpload[],
    post: { readonly postId: number; readonly forumId: number; readonly userId: number },
  ): Promise<readonly AttachmentRecord[]> {
    const created: AttachmentRecord[] = []

    for (const item of staged) {
      const record = await this.deps.attachments.create({
        postId: post.postId,
        forumId: post.forumId,
        uploaderUserId: post.userId,
        filename: item.upload.filename,
        contentType: item.upload.type.contentType,
        sizeBytes: item.upload.bytes.length,
        sourceKey: item.opaque ? null : item.key,
        storageKey: item.opaque ? item.key : null,
        status: item.opaque ? 'ready' : 'pending',
      })
      await this.deps.attachments.forgetKeys([item.key])
      created.push(record)
    }

    return created
  }

  async process(attachmentId: number): Promise<'done' | 'skipped' | 'failed'> {
    const record = await this.deps.attachments.findById(attachmentId)
    if (record === null || record.status !== 'pending' || record.sourceKey === null) {
      return 'skipped'
    }

    const type = attachmentCodec(record.contentType)
    if (type === null) {
      await this.deps.attachments.markFailed(record.id, 'Unsupported image type.')
      return 'failed'
    }

    const source = await this.deps.files.get(record.sourceKey)
    if (source === undefined) {
      await this.deps.attachments.markFailed(record.id, 'The uploaded file is no longer available.')
      return 'failed'
    }

    let processed: ProcessedImage
    try {
      processed = await this.deps.images.process({ bytes: source, codec: type })
    } catch {
      await this.deps.attachments.markFailed(record.id, 'That image could not be read.')
      await this.discard(record.sourceKey)
      return 'failed'
    }

    const fileKey = storageKeyFor('file', this.random)
    await this.deps.attachments.rememberKey(fileKey)
    await this.deps.files.put(fileKey, processed.bytes, {
      contentType: processed.contentType,
      visibility: 'private',
    })

    let thumbKey: string | null = null
    if (processed.thumbnail !== undefined) {
      thumbKey = storageKeyFor('thumb', this.random)
      await this.deps.attachments.rememberKey(thumbKey)
      await this.deps.files.put(thumbKey, processed.thumbnail.bytes, {
        contentType: processed.thumbnail.contentType,
        visibility: 'private',
      })
    }

    await this.deps.attachments.markReady(record.id, {
      storageKey: fileKey,
      thumbnailKey: thumbKey,
      width: processed.width,
      height: processed.height,
      sizeBytes: processed.bytes.length,
    })
    await this.deps.attachments.forgetKeys(thumbKey === null ? [fileKey] : [fileKey, thumbKey])

    await this.discard(record.sourceKey)
    return 'done'
  }

  async sweep(limit = 200): Promise<{ deleted: number; failed: number }> {
    const now = this.now()

    const stalled = await this.deps.attachments.stalled(
      new Date(now.getTime() - PROCESSING_GRACE_MINUTES * 60_000),
      limit,
    )
    for (const record of stalled) {
      await this.deps.attachments.markFailed(
        record.id,
        'Processing did not finish. Please upload it again.',
      )
      if (record.sourceKey !== null) await this.discard(record.sourceKey)
    }

    const keys = await this.deps.attachments.staleKeys(
      new Date(now.getTime() - ORPHAN_GRACE_MINUTES * 60_000),
      limit,
    )
    for (const key of keys) await this.discard(key)

    return { deleted: keys.length, failed: stalled.length }
  }

  private async discard(key: string): Promise<void> {
    await this.deps.files.delete(key)
    await this.deps.attachments.forgetKeys([key])
  }
}

export interface StagedUpload {
  readonly upload: AcceptedUpload
  readonly key: string
  readonly opaque: boolean
}

function attachmentCodec(contentType: string): 'png' | 'jpeg' | null {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/jpeg') return 'jpeg'
  return null
}

function defaultRandom(): string {
  return crypto.randomUUID()
}

export function isViewable(record: AttachmentRecord, type: AttachmentType | undefined): boolean {
  return record.status === 'ready' && record.storageKey !== null && type?.inline === true
}
