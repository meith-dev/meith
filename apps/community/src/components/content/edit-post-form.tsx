'use client'

import type { ReactNode } from 'react'
import { useActionState } from 'react'

import type { UploadLimits } from '@meith/attachments/limits'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { deletePostAction, editPostAction, restorePostAction } from '@/server/content-actions'
import type { EditableAttachment } from '@/view/attachments'

import { FormError, PendingButton, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { AttachmentField } from './attachment-field'
import { MarkdownEditor } from './markdown-editor'

function ExistingAttachments({
  attachments,
  copy,
}: {
  attachments: readonly EditableAttachment[]
  copy: Copy
}) {
  if (attachments.length === 0) return null

  return (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="font-medium">{fromCopy(copy, 'composer.edit.attachments')}</legend>
      <ul className="flex flex-col gap-2">
        {attachments.map((attachment) => (
          <li
            key={attachment.id}
            className="flex items-center gap-3 rounded-md border border-border bg-card p-2"
          >
            {attachment.thumbnailHref !== null ? (
              <img
                src={attachment.thumbnailHref}
                alt=""
                className="size-10 shrink-0 rounded object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded bg-muted text-sm text-muted-foreground"
              >
                {attachment.status === 'failed' ? '!' : attachment.status === 'pending' ? '…' : '·'}
              </span>
            )}

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{attachment.filename}</span>
              <span className="text-xs text-muted-foreground">
                {attachment.status === 'pending' &&
                  fromCopy(copy, 'composer.edit.attachmentProcessing')}
                {attachment.status === 'failed' && fromCopy(copy, 'composer.edit.attachmentFailed')}
                {attachment.status === 'ready' && attachment.size}
              </span>
            </span>

            <label className="flex shrink-0 items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                name="removeAttachmentIds"
                value={attachment.id}
                aria-label={formatFromCopy(copy, 'composer.edit.removeAttachment', {
                  name: attachment.filename,
                })}
                className="size-4"
              />
              <span aria-hidden="true">{fromCopy(copy, 'composer.edit.remove')}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

export function EditPostForm({
  threadId,
  postId,
  message,
  reason,
  attachments,
  attachmentLimits,
  toolbar,
  copy,
}: {
  threadId: number
  postId: number
  message: string
  reason: string | null
  attachments: readonly EditableAttachment[]
  attachmentLimits: UploadLimits | null
  toolbar?: ReactNode
  copy: Copy
}) {
  const [state, action] = useActionState(editPostAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="postId" value={postId} />

      <MarkdownEditor
        required
        defaultValue={state.values?.message ?? message}
        preview={state.notice === 'preview' ? (state.preview ?? '') : undefined}
        toolbar={toolbar}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'composer.edit.reason')}</span>
        <input
          type="text"
          name="reason"
          maxLength={200}
          defaultValue={state.values?.reason ?? reason ?? ''}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </label>

      <ExistingAttachments attachments={attachments} copy={copy} />

      {attachmentLimits !== null && <AttachmentField limits={attachmentLimits} />}

      <div className="flex flex-wrap gap-3">
        <SubmitButton>{fromCopy(copy, 'composer.edit.submit')}</SubmitButton>
        <PendingButton
          name="intent"
          value="preview"
          showWorking
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {fromCopy(copy, 'composer.preview')}
        </PendingButton>
      </div>
    </form>
  )
}

export function DeletePostForm({
  threadId,
  postId,
  copy,
}: {
  threadId: number
  postId: number
  copy: Copy
}) {
  const [state, action] = useActionState(deletePostAction, EMPTY_STATE)

  return (
    <form action={action} className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
      <FormError message={state.error} />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="postId" value={postId} />
      <p className="text-sm text-muted-foreground">{fromCopy(copy, 'composer.edit.deleteBlurb')}</p>
      <div>
        <PendingButton
          showWorking
          className="inline-flex h-10 items-center justify-center rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {fromCopy(copy, 'composer.edit.delete')}
        </PendingButton>
      </div>
    </form>
  )
}

export function RestorePostForm({
  threadId,
  postId,
  copy,
}: {
  threadId: number
  postId: number
  copy: Copy
}) {
  const [state, action] = useActionState(restorePostAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="postId" value={postId} />
      <p className="text-sm text-muted-foreground">
        {fromCopy(copy, 'composer.edit.restoreBlurb')}
      </p>
      <div>
        <SubmitButton>{fromCopy(copy, 'composer.edit.restore')}</SubmitButton>
      </div>
    </form>
  )
}
