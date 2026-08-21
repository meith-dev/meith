'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { deletePostAction, editPostAction, restorePostAction } from '@/server/content-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'
import { MarkdownEditor } from './markdown-editor'

export function EditPostForm({
  threadId,
  postId,
  message,
  reason,
  toolbar = 'inline',
  copy,
}: {
  threadId: number
  postId: number
  message: string
  reason: string | null
  toolbar?: 'inline' | 'external'
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
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <SubmitButton>{fromCopy(copy, 'composer.edit.submit')}</SubmitButton>
        <button
          type="submit"
          name="intent"
          value="preview"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {fromCopy(copy, 'composer.preview')}
        </button>
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
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {fromCopy(copy, 'composer.edit.delete')}
        </button>
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
