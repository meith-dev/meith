/**
 * F42 — accepting, storing, processing and serving an attachment.
 *
 * ## The order of writes is the design
 *
 * `remember key → put object → create post → insert row → forget key`.
 *
 * Every step can be the last one, because a process can die at any point, and
 * the invariant that has to survive is **no object in the store without
 * something that knows about it**. Inserting the row first would be simpler and
 * would leave a row pointing at bytes that were never written; putting the
 * object first without remembering the key leaves bytes nobody can name. So the
 * key is written to `attachment_orphans` before the object exists, and removed
 * when a row takes ownership. Whatever is left in that table after the grace
 * period is garbage, by construction rather than by inference.
 *
 * ## Nothing decodes an image on the request path
 *
 * A condition of ADR 0003 rather than an implementation detail. `accept()` runs
 * in the request and reads *headers* — magic bytes and declared dimensions —
 * which is bounded work on a bounded prefix. The decode, the re-encode and the
 * thumbnail happen in `process()`, which runs in a queued job. Until it
 * succeeds the row is `pending` and nothing will serve it.
 *
 * ## The re-encode is the security boundary, not the validation
 *
 * `accept()` establishes that a file claims to be a PNG and is not a
 * decompression bomb. It cannot establish that the file is *only* a PNG — a ZIP
 * appended after the IEND chunk is invisible to it, and to every other
 * validator. `process()` is what removes it, by writing the stored object from
 * decoded pixels. See ADR 0003.
 */
import { ValidationError } from '@forum/core'
import type { FileStore } from '@forum/core'

import { declaredDimensions } from './dimensions'
import { maxBytesFor, maxPerPostFor, type UploadLimits } from './limits'
import { sanitiseFilename, storageKeyFor } from './filename'
import {
  MAGIC_BYTES_NEEDED,
  sniff,
  type AcceptedUpload,
  type AttachmentRecord,
  type AttachmentType,
  type IncomingFile,
} from './types'

/**
 * The largest image the board will decode.
 *
 * Not a file-size limit — the two are unrelated, which is the entire point of
 * `dimensions.ts`. 50 megapixels is roughly 200 MB of RGBA, which a decoder can
 * survive; the flat 30,000 × 30,000 PNG that fits in 90 KB on the wire is 900
 * megapixels and cannot be.
 */
export const MAX_MEGAPIXELS = 50

/** The box a re-encoded image is fitted into, and the thumbnail's box. */
export const MAX_IMAGE = { width: 2000, height: 2000 } as const
export const THUMBNAIL = { width: 320, height: 320 } as const

/** Below this an image is shown at full size and gets no thumbnail. */
export const THUMBNAIL_THRESHOLD = THUMBNAIL.width

/**
 * Validate one file, or say why not.
 *
 * The message names the file, because a member attaching four things to a post
 * and being told "that file is too large" has been told nothing.
 */
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
    throw new ValidationError(`“${shown}” is too short to be a file of any type this board accepts.`)
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
      /*
       * An image whose header cannot be read is refused rather than passed to
       * the decoder to find out. The decode is the thing being protected.
       */
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

/**
 * Validate a whole submission.
 *
 * `existing` is what the post already has, so an edit that adds a fifth file to
 * a post with four is measured against the same cap as posting five at once.
 */
export function acceptFiles(
  files: readonly IncomingFile[],
  limits: UploadLimits,
  existing = 0,
): readonly AcceptedUpload[] {
  const cap = maxPerPostFor(limits)
  if (existing + files.length > cap) {
    throw new ValidationError(
      `A post may have at most ${cap} attachment${cap === 1 ? '' : 's'}.`,
    )
  }
  return files.map((file) => acceptFile(file, limits))
}

function describeSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/* ------------------------------------------------------------------ *
 * Ports
 * ------------------------------------------------------------------ */

/** A re-encoded image and, when it is worth having, its thumbnail. */
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

/**
 * Decoding and re-encoding, as a port.
 *
 * The implementation is `@forum/drivers/images` and carries ~630 KB of
 * WebAssembly with it (ADR 0003). It is a port so this package can be tested
 * without any of that, and — more importantly — so nothing that merely reads
 * attachments has to load a codec.
 */
export interface ImageProcessor {
  process(input: {
    readonly bytes: Uint8Array
    readonly codec: 'png' | 'jpeg'
    /**
     * The box the output is fitted into. Defaults to `MAX_IMAGE`.
     *
     * A parameter rather than a second port because F58's avatars want the
     * identical pipeline at a much smaller size, and two implementations of
     * "decode, fit, encode" would be two places for a codec change to land.
     */
    readonly fit?: { readonly width: number; readonly height: number }
    /**
     * Whether to make a preview as well. Defaults to true.
     *
     * An avatar is already smaller than any thumbnail of it would be, so
     * generating one is a second lossy encode of an image nothing will ask for.
     */
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

/**
 * An attachment together with the visibility of the content it hangs from.
 *
 * One read rather than two, because authorising a download needs both and
 * fetching them separately would leave a window in which the post was deleted
 * between the checks. `forumId` on the row answers *which* forum; this answers
 * whether the thing it is attached to is visible at all.
 */
export interface AttachmentForDownload {
  readonly record: AttachmentRecord
  readonly postVisibility: string
  readonly threadVisibility: string
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
  /** Rows still `pending` and older than `before`, oldest first. */
  stalled(before: Date, limit: number): Promise<readonly AttachmentRecord[]>

  /** The orphan ledger. */
  rememberKey(key: string): Promise<void>
  forgetKeys(keys: readonly string[]): Promise<void>
  staleKeys(before: Date, limit: number): Promise<readonly string[]>
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export interface AttachmentServiceDeps {
  readonly attachments: AttachmentRepository
  readonly files: FileStore
  readonly images: ImageProcessor
  /** Injected so a test can produce keys it can assert on. */
  readonly random?: () => string
  readonly now?: () => Date
}

/** How long an object may sit unclaimed before the sweep may delete it. */
export const ORPHAN_GRACE_MINUTES = 60

/** How long a row may stay `pending` before it is called failed. */
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

  /**
   * Write the uploaded bytes to the store, before any post exists.
   *
   * Returns what `attach` needs. Split from `attach` because the post is
   * created between them: a validation failure inside the composer must not
   * leave a post behind, and a storage failure must not either. What it *can*
   * leave behind is an object, which is what the ledger is for.
   */
  async stage(
    uploads: readonly AcceptedUpload[],
  ): Promise<readonly StagedUpload[]> {
    const staged: StagedUpload[] = []
    for (const upload of uploads) {
      const opaque = upload.type.handling === 'opaque'
      const key = storageKeyFor(opaque ? 'file' : 'source', this.random)

      await this.deps.attachments.rememberKey(key)
      await this.deps.files.put(key, upload.bytes, {
        contentType: upload.type.contentType,
        /*
         * Always private, including for a public forum. The permission that
         * governs a download is `attachment.download` in the *forum*, and a
         * public object is one nobody can revoke — moving a thread into a
         * private forum would not take its images with it.
         */
        visibility: 'private',
      })

      staged.push({ upload, key, opaque })
    }
    return staged
  }

  /**
   * Give the staged objects a row, now that their post exists.
   *
   * An opaque file is `ready` immediately: there is no transformation to wait
   * for, and a PDF that stayed `pending` until a job ran would be a download
   * link that does not work for a minute for no reason.
   */
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

  /**
   * Re-encode one pending attachment. The queued job's body.
   *
   * Idempotent, because the queue is at-least-once: a row that is no longer
   * `pending` is a no-op, and the work it would redo has already been done.
   */
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
      /*
       * A decode failure here is a file that passed the header checks and is
       * still not an image — which is exactly the case the re-encode exists to
       * catch, so it is a normal outcome and not an error to retry. The reason
       * is shown to the uploader; the bytes are dropped either way.
       */
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
    await this.deps.attachments.forgetKeys(
      thumbKey === null ? [fileKey] : [fileKey, thumbKey],
    )

    /* The hostile bytes do not outlive the job that read them. */
    await this.discard(record.sourceKey)
    return 'done'
  }

  /**
   * Delete objects nothing owns, and fail rows nothing finished.
   *
   * Both halves are bounded and both are safe to run twice. The grace period is
   * what makes the first half safe at all: a key is remembered *before* its
   * object is written, so a sweep with no grace would race every upload in
   * flight and delete the bytes out from under it.
   */
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

  /** Delete an object and forget it, in that order. */
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

/** Whether an attachment may be shown, as opposed to merely linked. */
export function isViewable(record: AttachmentRecord, type: AttachmentType | undefined): boolean {
  return record.status === 'ready' && record.storageKey !== null && type?.inline === true
}
