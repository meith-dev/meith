'use client'

import { useActionState } from 'react'

import type { UploadLimits } from '@meith/attachments/limits'
import type { Draft } from '@meith/drafts'
import { Alert, AlertDescription, cn, Disclosure } from '@meith/ui'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { createReplyAction } from '@/server/content-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'
import { AttachmentField } from './attachment-field'
import { ComposerIntents } from './composer-intents'
import { ComposerRecovery } from './composer-recovery'
import { MarkdownEditor } from './markdown-editor'

export function ReplyForm({
  threadId,
  seenLastPostId,
  prefill,
  canSubscribe,
  attachmentLimits,
  draft,
  collapsible = false,
  toolbar = 'inline',
  copy,
}: {
  threadId: number
  seenLastPostId: number | null
  prefill: string
  canSubscribe: boolean
  attachmentLimits: UploadLimits | null
  draft: Draft | null
  collapsible?: boolean
  toolbar?: 'inline' | 'external'
  copy: Copy
}) {
  const [state, action] = useActionState(createReplyAction, EMPTY_STATE)

  const form = (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />

      {state.notice === 'saved' && (
        <Alert tone="success">
          <AlertDescription>{fromCopy(copy, 'composer.draftSaved')}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="threadId" value={threadId} />
      {seenLastPostId !== null && (
        <input
          type="hidden"
          name="seenLastPostId"
          value={state.values?.seenLastPostId ?? seenLastPostId}
        />
      )}

      <ComposerRecovery
        storageKey={`meith:composer:reply:${threadId}`}
        scope={{ threadId }}
        serverUpdatedAt={draft?.updatedAt?.getTime() ?? 0}
        copy={copy}
      />

      <MarkdownEditor
        rows={collapsible ? 6 : 12}
        required
        defaultValue={state.values?.message ?? draft?.message ?? prefill}
        preview={state.notice === 'preview' ? (state.preview ?? '') : undefined}
        toolbar={toolbar}
        {...(attachmentLimits !== null ? { attachTo: { kind: 'thread', threadId } } : {})}
      />

      {attachmentLimits !== null && <AttachmentField limits={attachmentLimits} />}

      {canSubscribe && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="subscribe" value="1" className="size-4 accent-primary" />
          <span>{fromCopy(copy, 'composer.notifyReplies')}</span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton className={collapsible ? 'w-auto' : 'w-full sm:w-auto'}>
          {fromCopy(copy, 'composer.reply.submit')}
        </SubmitButton>
        <ComposerIntents />
      </div>
    </form>
  )

  if (!collapsible) return form

  const forceOpen = state.error !== undefined || state.notice !== undefined || draft !== null

  return (
    <Disclosure
      summary={fromCopy(copy, 'composer.reply.write')}
      aside={
        draft === null
          ? fromCopy(copy, 'composer.reply.quick')
          : fromCopy(copy, 'composer.reply.draftSaved')
      }
      className={cn(forceOpen && 'border-ring/40')}
      {...(forceOpen ? { open: true } : {})}
    >
      {form}
    </Disclosure>
  )
}
