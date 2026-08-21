'use server'

import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { attachmentHref, attachmentModel } from '../view/attachments'
import { acceptSingleFile, attachmentLimits, attachmentService, canAttach } from './attachments'
import { getContainer } from './container'
import { getActor } from './context'
import { emitEvent, filterView } from './plugin-view'
import { resolveReplyTarget } from './reply-core'
import { resolveThreadTarget } from './thread-core'

export type AttachmentTarget =
  | { readonly kind: 'forum'; readonly forumId: number }
  | { readonly kind: 'thread'; readonly threadId: number }

export interface UploadedInlineAttachment {
  readonly id: number
  readonly filename: string
  readonly isImage: boolean
  readonly thumbnailHref: string | null
  readonly href: string
}

export type UploadInlineAttachmentResult =
  | { readonly ok: true; readonly attachment: UploadedInlineAttachment }
  | { readonly ok: false; readonly error: string }

/**
 * Uploads one file and gives it an id immediately, before the post that will
 * place it inline (with `[attachment=id]`) even exists — see docs/formatting.md.
 * The upload is not yet attached to anything: it is claimed by the actual post
 * at submission time (claimAttachmentsAction in content-actions.ts), and swept
 * away if that submission never happens.
 */
export async function uploadInlineAttachmentAction(
  target: AttachmentTarget,
  form: FormData,
): Promise<UploadInlineAttachmentResult> {
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged-attach-file'))

    const scope =
      target.kind === 'forum'
        ? (await resolveThreadTarget(actor, target.forumId)).scope
        : (await resolveReplyTarget(actor, target.threadId)).scope

    if (!canAttach(actor, scope)) throw new ForbiddenError(msg('error.app.attach-files-forum'))

    const accepted = await acceptSingleFile(form, attachmentLimits(scope))

    const objections = await filterView('attachment.upload.validate', [], {
      filename: accepted.filename,
      bytes: accepted.bytes.length,
      detectedMimeType: accepted.type.contentType,
      uploaderId: actor.userId,
    })
    if (objections.length > 0) throw new ValidationError(objections[0]!)

    const service = attachmentService()
    if (service === null) {
      throw new ValidationError(msg('error.app.board-accept-file-attachments'))
    }

    const uploaded = await service.uploadOrphan(accepted, {
      forumId: scope.forumId,
      uploaderUserId: actor.userId,
    })

    await emitEvent(
      'attachment.uploaded',
      { attachmentId: uploaded.id, postId: null, bytes: uploaded.sizeBytes },
      { userId: actor.userId, isGuest: false },
    )

    // Processed synchronously, not queued: placing it inline bakes its markup into
    // the post's HTML the moment that post is submitted (see attachment-embed.ts) —
    // there is no later pass that would pick up a still-processing image and add it
    // in. A member who clicks submit right after uploading must not lose the picture.
    if (uploaded.status === 'pending') await service.process(uploaded.id)
    const record = (await getContainer().attachments?.findById(uploaded.id)) ?? uploaded

    const model = attachmentModel(record)

    return {
      ok: true,
      attachment: {
        id: record.id,
        filename: record.filename,
        // Still 'pending' if re-encoding itself failed — attachmentModel() (which
        // requires 'ready') has nothing to show then; the filename is enough for
        // the composer, and the post itself will simply drop the placeholder.
        isImage: model?.isImage ?? false,
        thumbnailHref: model?.thumbnailHref ?? null,
        href: model?.href ?? attachmentHref(record.id),
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : msg('error.attachments.upload-failed').text,
    }
  }
}
