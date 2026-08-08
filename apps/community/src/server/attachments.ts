import 'server-only'

/**
 * F42 at the app layer.
 *
 * Three jobs, and they are here together because they share one question —
 * *may this person do this, in this community* — which the Authorizer owns and
 * which no route may answer for itself (R4):
 *
 *  1. taking files off a submitted composer form and storing them;
 *  2. giving them rows once the post exists, and asking for the re-encode;
 *  3. authorising a download.
 *
 * The write path is deliberately **stage, then post, then attach**. Files are
 * written to the store before the post exists, so a failure creating the post
 * leaves objects with no row — which is precisely what the orphan ledger and
 * the hourly sweep are for. The alternative, creating the post first, leaves a
 * post whose images silently never arrive, and there is nowhere to report that
 * to: the member has already been redirected to their own post.
 */
import { ForbiddenError, ValidationError } from '@meith/core'
import type { CommunityPermissions } from '@meith/core'
import type { Actor } from '@meith/authorization'
import {
  ATTACHMENT_FIELD,
  AttachmentService,
  acceptFiles,
  attachmentType,
  type AttachmentRecord,
  type IncomingFile,
  type StagedUpload,
  type UploadLimits,
} from '@meith/attachments'
import { imageProcessor } from '@meith/drivers/images'
import { drivers } from '@meith/drivers'

import { limitMessage, spendLimit } from './antispam'
import { getContainer } from './container'

/** A community scope as `content-actions.ts` builds it. */
export interface AttachmentScope {
  readonly communityId: number
  readonly community: CommunityPermissions
}

/**
 * The board's attachment service, or null when it cannot have one.
 *
 * Null in fixture mode (D38) and on a deployment with no file store. Both are
 * "the board cannot accept files", and both must be answered *before* a byte is
 * accepted rather than after — an upload that validates, stores and then finds
 * there is nowhere to record it is the worst of the three outcomes.
 */
export function attachmentService(): AttachmentService | null {
  const { attachments } = getContainer()
  if (attachments === null) return null

  return new AttachmentService({
    attachments,
    files: drivers().files,
    images: imageProcessor,
  })
}

/**
 * What this member may attach in this community.
 *
 * Read off the resolved community matrix, the same way `post-scope.ts` reads
 * `editTimeLimitMinutes`: the combination across groups has already happened
 * (R4.2), and 0 still means unlimited — which `maxBytesFor` and `maxPerPostFor`
 * are the only two places allowed to interpret.
 */
export function attachmentLimits(scope: AttachmentScope): UploadLimits {
  return {
    maxPerPost: Number(scope.community.maxAttachmentsPerPost ?? 0),
    maxSizeKb: Number(scope.community.maxAttachmentSizeKb ?? 0),
  }
}

/**
 * Whether the composer should offer a file input at all.
 *
 * A control that produces an error every time it is used is worse than no
 * control (D32), so this is the same set of conditions the write path enforces
 * — not a looser display rule that would drift from it.
 */
export function canAttach(actor: Actor, scope: AttachmentScope): boolean {
  const { authorizer } = getContainer()
  return attachmentService() !== null && authorizer.can(actor, 'attachment.upload', scope)
}

/** The files a submitted composer form carries, ignoring empty inputs. */
export async function submittedFiles(form: FormData): Promise<readonly IncomingFile[]> {
  const files: IncomingFile[] = []

  for (const value of form.getAll(ATTACHMENT_FIELD)) {
    /*
     * A `<input type="file">` left untouched still submits — as an entry with
     * an empty name and no bytes. Treating that as an upload would make every
     * post from a browser that renders the control fail validation.
     */
    if (!(value instanceof File) || value.size === 0) continue
    files.push({
      filename: value.name,
      bytes: new Uint8Array(await value.arrayBuffer()),
    })
  }

  return files
}

/**
 * Validate and store the files on a submission, before the post exists.
 *
 * Returns an empty list when nothing was attached, without touching the store
 * or the permission — a member with no upload right may still post.
 */
export async function stageAttachments(
  actor: Actor,
  scope: AttachmentScope,
  files: readonly IncomingFile[],
  existing = 0,
): Promise<readonly StagedUpload[]> {
  if (files.length === 0) return []

  const service = attachmentService()
  if (service === null) {
    throw new ValidationError('This board cannot accept file attachments.')
  }

  const { authorizer } = getContainer()
  if (!authorizer.can(actor, 'attachment.upload', scope)) {
    throw new ForbiddenError('You may not attach files in this community.')
  }
  if (actor.userId === null) {
    throw new ForbiddenError('You must be logged in to attach a file.')
  }

  /*
   * F46, charged **per file** rather than per submission. An upload limit that
   * counted forms would let one post carry ten files for the price of one,
   * which is the shape of the abuse it exists to bound — the cost to the board
   * is bytes and re-encodes, and both scale with files.
   *
   * Spent after the permission checks, and before anything is written or
   * re-encoded.
   */
  const limited = await spendLimit({ scope: 'upload', actor, cost: files.length })
  if (limited !== null && !limited.allowed) throw new ValidationError(limitMessage(limited))

  return service.stage(acceptFiles(files, attachmentLimits(scope), existing))
}

/**
 * Give staged objects their rows and ask for the re-encode.
 *
 * The enqueue is **after** the row and outside any transaction, on purpose: a
 * job that arrives before its row exists finds nothing and gives up, and the
 * queue would not deliver it again. If the enqueue is what fails, the row stays
 * `pending` and the hourly sweep fails it with a reason the uploader can act
 * on — which is a worse outcome than a re-encode and a better one than a
 * silently broken image.
 */
export async function attachStaged(
  staged: readonly StagedUpload[],
  post: { readonly postId: number; readonly communityId: number; readonly userId: number },
): Promise<readonly AttachmentRecord[]> {
  if (staged.length === 0) return []

  const service = attachmentService()
  if (service === null) return []

  const created = await service.attach(staged, post)

  for (const record of created) {
    if (record.status !== 'pending') continue
    await drivers().queue.enqueue(
      'attachments.process',
      { attachmentId: record.id },
      /* One job per attachment, whatever happens upstream. */
      { dedupeKey: `attachment:${record.id}` },
    )
  }

  return created
}

/** Every attachment on a page of posts, in one query. */
export async function attachmentsForPosts(
  postIds: readonly number[],
): Promise<readonly AttachmentRecord[]> {
  const { attachments } = getContainer()
  if (attachments === null || postIds.length === 0) return []
  return attachments.listForPosts(postIds)
}

/** What a download route is allowed to serve. */
export interface DownloadGrant {
  readonly record: AttachmentRecord
  readonly key: string
  readonly contentType: string
  readonly filename: string
}

/**
 * Resolve one attachment for a download, or say no.
 *
 * Every refusal returns null rather than a reason. Distinguishing "no such
 * attachment" from "you may not have this one" would turn the download route
 * into an oracle for what exists in communities the caller cannot see — and the
 * attachment id is a small integer anybody can enumerate.
 */
export async function resolveDownload(
  actor: Actor,
  id: number,
  want: 'file' | 'thumb',
): Promise<DownloadGrant | null> {
  const { attachments, authorizer } = getContainer()
  if (attachments === null) return null

  const found = await attachments.findForDownload(id)
  if (found === null) return null

  const { record } = found
  if (record.status !== 'ready' || record.storageKey === null) return null

  const scope = {
    communityId: record.communityId,
    community: await authorizer.communityMatrix(actor, record.communityId),
  }
  if (!authorizer.can(actor, 'thread.view', scope)) return null
  if (!authorizer.can(actor, 'attachment.download', scope)) return null

  /*
   * Unapproved and deleted content keeps its attachments unreadable to
   * everybody who cannot see the content itself. Checked here rather than left
   * to the postbit, because a direct URL never goes through the postbit — which
   * is exactly how this kind of check gets missed.
   */
  const hidden =
    found.postVisibility !== 'visible' || found.threadVisibility !== 'visible'
  if (hidden && !authorizer.can(actor, 'content.viewUnapproved', scope)) return null

  const type = attachmentType(record.contentType)
  if (type === undefined) return null

  if (want === 'thumb') {
    if (record.thumbnailKey === null) return null
    return {
      record,
      key: record.thumbnailKey,
      contentType: 'image/jpeg',
      filename: record.filename,
    }
  }

  return {
    record,
    key: record.storageKey,
    contentType: record.contentType,
    filename: record.filename,
  }
}
