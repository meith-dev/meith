import { msg } from '@meith/i18n'
import 'server-only'

import {
  type AcceptedUpload,
  ATTACHMENT_FIELD,
  type AttachmentRecord,
  AttachmentService,
  acceptFile,
  acceptFiles,
  attachmentType,
  type IncomingFile,
  maxPerPostFor,
  type StagedUpload,
  type UploadLimits,
} from '@meith/attachments'
import type { Actor } from '@meith/authorization'
import type { ForumPermissions } from '@meith/core'
import { ForbiddenError, ValidationError } from '@meith/core'
import { drivers } from '@meith/drivers'
import { imageProcessor } from '@meith/drivers/images'

import { limitMessage, spendLimit } from './antispam'
import { getContainer } from './container'
import { positiveIntIn } from './form-values'
import { emitEvent, filterView } from './plugin-view'

export interface AttachmentScope {
  readonly forumId: number
  readonly forum: ForumPermissions
  readonly allowsAttachments: boolean
}

export function attachmentService(): AttachmentService | null {
  const { attachments } = getContainer()
  if (attachments === null) return null

  return new AttachmentService({
    attachments,
    files: drivers().files,
    images: imageProcessor,
  })
}

export function attachmentLimits(scope: AttachmentScope): UploadLimits {
  return {
    maxPerPost: Number(scope.forum.maxAttachmentsPerPost ?? 0),
    maxSizeKb: Number(scope.forum.maxAttachmentSizeKb ?? 0),
  }
}

export function canAttach(actor: Actor, scope: AttachmentScope): boolean {
  const { authorizer } = getContainer()
  return (
    scope.allowsAttachments &&
    attachmentService() !== null &&
    authorizer.can(actor, 'attachment.upload', scope)
  )
}

export async function submittedFiles(form: FormData): Promise<readonly IncomingFile[]> {
  const files: IncomingFile[] = []

  for (const value of form.getAll(ATTACHMENT_FIELD)) {
    if (!(value instanceof File) || value.size === 0) continue
    files.push({
      filename: value.name,
      bytes: new Uint8Array(await value.arrayBuffer()),
    })
  }

  return files
}

export async function acceptSingleFile(
  form: FormData,
  limits: UploadLimits,
): Promise<AcceptedUpload> {
  const value = form.get(ATTACHMENT_FIELD)
  if (!(value instanceof File) || value.size === 0) {
    throw new ValidationError(msg('error.attachments.empty', { name: '' }))
  }

  return acceptFile(
    { filename: value.name, bytes: new Uint8Array(await value.arrayBuffer()) },
    limits,
  )
}

export async function stageAttachments(
  actor: Actor,
  scope: AttachmentScope,
  files: readonly IncomingFile[],
  existing = 0,
): Promise<readonly StagedUpload[]> {
  if (files.length === 0) return []

  const service = attachmentService()
  if (service === null) {
    throw new ValidationError(msg('error.app.board-accept-file-attachments'))
  }
  if (!scope.allowsAttachments) {
    throw new ValidationError(msg('error.app.forum-accept-file-attachments'))
  }

  const { authorizer } = getContainer()
  if (!authorizer.can(actor, 'attachment.upload', scope)) {
    throw new ForbiddenError(msg('error.app.attach-files-forum'))
  }
  if (actor.userId === null) {
    throw new ForbiddenError(msg('error.app.must-logged-attach-file'))
  }

  const limited = await spendLimit({ scope: 'upload', actor, cost: files.length })
  if (limited !== null && !limited.allowed) throw new ValidationError(limitMessage(limited))

  const accepted = acceptFiles(files, attachmentLimits(scope), existing)

  for (const upload of accepted) {
    const objections = await filterView('attachment.upload.validate', [], {
      filename: upload.filename,
      bytes: upload.bytes.length,
      detectedMimeType: upload.type.contentType,
      uploaderId: actor.userId,
    })
    if (objections.length > 0) throw new ValidationError(objections[0]!)
  }

  return service.stage(accepted)
}

export async function resolveEditAttachmentScope(
  actor: Actor,
  forumId: number,
): Promise<AttachmentScope> {
  const { authorizer, threadWrites } = getContainer()
  const rules = threadWrites === null ? null : await threadWrites.postingRules(forumId)

  return {
    forumId,
    forum: await authorizer.forumMatrix(actor, forumId),
    allowsAttachments: rules?.allowAttachments === true,
  }
}

export async function removeAttachmentsFromPost(
  ids: readonly number[],
  post: { readonly postId: number; readonly userId: number },
): Promise<readonly AttachmentRecord[]> {
  const service = attachmentService()
  if (service === null || ids.length === 0) return []

  const removed: AttachmentRecord[] = []
  for (const id of ids) {
    const record = await service.removeFromPost(id, post.postId)
    if (record === null) continue
    removed.push(record)
    await emitEvent(
      'attachment.deleted',
      { attachmentId: record.id },
      { userId: post.userId, isGuest: false },
    )
  }
  return removed
}

export async function attachStaged(
  staged: readonly StagedUpload[],
  post: { readonly postId: number; readonly forumId: number; readonly userId: number },
): Promise<readonly AttachmentRecord[]> {
  if (staged.length === 0) return []

  const service = attachmentService()
  if (service === null) return []

  const created = await service.attach(staged, post)
  const viewer = { userId: post.userId, isGuest: false }

  for (const record of created) {
    await emitEvent(
      'attachment.uploaded',
      { attachmentId: record.id, postId: post.postId, bytes: record.sizeBytes },
      viewer,
    )

    if (record.status !== 'pending') continue
    await drivers().queue.enqueue(
      'attachments.process',
      { attachmentId: record.id },
      { dedupeKey: `attachment:${record.id}` },
    )
  }

  return created
}

export async function claimAttachments(
  form: FormData,
  post: { readonly postId: number; readonly forumId: number; readonly userId: number },
  scope: AttachmentScope,
  existing: number,
): Promise<readonly AttachmentRecord[]> {
  const service = attachmentService()
  if (service === null) return []

  const cap = Math.max(0, maxPerPostFor(attachmentLimits(scope)) - existing)
  if (cap === 0) return []

  const ids = form
    .getAll('claimedAttachmentIds')
    .map((value) => (typeof value === 'string' ? positiveIntIn(value) : null))
    .filter((id): id is number => id !== null)
    .slice(0, cap)

  if (ids.length === 0) return []

  return service.claim(ids, {
    postId: post.postId,
    forumId: post.forumId,
    uploaderUserId: post.userId,
  })
}

export async function attachmentsForPosts(
  postIds: readonly number[],
): Promise<readonly AttachmentRecord[]> {
  const { attachments } = getContainer()
  if (attachments === null || postIds.length === 0) return []
  return attachments.listForPosts(postIds)
}

export interface DownloadGrant {
  readonly record: AttachmentRecord
  readonly key: string
  readonly contentType: string
  readonly filename: string
}

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
    forumId: record.forumId,
    forum: await authorizer.forumMatrix(actor, record.forumId),
  }
  if (
    !authorizer.can(actor, 'thread.view', {
      ...(await authorizer.moderatorTargetIn(actor, scope.forumId, scope.forum)),
      threadAuthorId: found.threadAuthorUserId,
    })
  )
    return null
  if (!authorizer.can(actor, 'attachment.download', scope)) return null

  const deleted = found.postVisibility === 'deleted' || found.threadVisibility === 'deleted'
  if (deleted && !authorizer.can(actor, 'content.viewDeleted', scope)) return null

  const unapproved =
    found.postVisibility === 'unapproved' || found.threadVisibility === 'unapproved'
  if (unapproved && !authorizer.can(actor, 'content.viewUnapproved', scope)) return null

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
