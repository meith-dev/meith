'use client'

import { useActionState } from 'react'

import type { UploadLimits } from '@meith/attachments/limits'
import type { Draft } from '@meith/drafts'
import { Disclosure } from '@meith/ui'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { createThreadAction } from '@/server/content-actions'

import { Field, FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { AttachmentField } from './attachment-field'
import { ComposerIntents } from './composer-intents'
import { ComposerRecovery } from './composer-recovery'
import { MarkdownEditor } from './markdown-editor'

export interface PrefixOption {
  readonly id: number
  readonly label: string
}

export function NewThreadForm({
  forumId,
  prefixes,
  requiresPrefix,
  canSubscribe,
  canPostPoll,
  attachmentLimits,
  draft,
  toolbar = 'inline',
  copy,
}: {
  forumId: number
  prefixes: readonly PrefixOption[]
  requiresPrefix: boolean
  canSubscribe: boolean
  canPostPoll: boolean
  attachmentLimits: UploadLimits | null
  draft: Draft | null
  toolbar?: 'inline' | 'external'
  copy: Copy
}) {
  const [state, action] = useActionState(createThreadAction, EMPTY_STATE)

  const hasPollDraft =
    (state.values?.pollQuestion ?? '') !== '' || (state.values?.pollOption ?? '') !== ''

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      {state.notice === 'saved' && <p role="status">{fromCopy(copy, 'composer.draftSaved')}</p>}
      <input type="hidden" name="forumId" value={forumId} />

      <Field
        label={fromCopy(copy, 'composer.newThread.subject')}
        name="title"
        required
        minLength={3}
        maxLength={120}
        defaultValue={state.values?.title ?? draft?.title}
      />

      {prefixes.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            {requiresPrefix
              ? fromCopy(copy, 'composer.newThread.prefix')
              : fromCopy(copy, 'composer.newThread.prefixOptional')}
          </span>
          <select
            name="prefixId"
            defaultValue={state.values?.prefixId ?? draft?.prefixId?.toString() ?? ''}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <option value="">
              {requiresPrefix
                ? fromCopy(copy, 'composer.newThread.choosePrefix')
                : fromCopy(copy, 'composer.newThread.noPrefix')}
            </option>
            {prefixes.map((prefix) => (
              <option key={prefix.id} value={prefix.id}>
                {prefix.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <ComposerRecovery
        storageKey={`meith:composer:new-thread:${forumId}`}
        scope={{ forumId }}
        serverUpdatedAt={draft?.updatedAt?.getTime() ?? 0}
        copy={copy}
      />

      <MarkdownEditor
        required
        defaultValue={state.values?.message ?? draft?.message}
        preview={state.notice === 'preview' ? (state.preview ?? '') : undefined}
        toolbar={toolbar}
        {...(attachmentLimits !== null ? { attachTo: { kind: 'forum', forumId } } : {})}
      />

      {attachmentLimits !== null && <AttachmentField limits={attachmentLimits} />}

      {canPostPoll && (
        <Disclosure
          summary={fromCopy(copy, 'composer.newThread.addPoll')}
          aside={fromCopy(copy, 'composer.newThread.optional')}
          contentClassName="flex flex-col gap-2"
          {...(hasPollDraft ? { open: true } : {})}
        >
          <Field
            label={fromCopy(copy, 'composer.newThread.question')}
            name="pollQuestion"
            maxLength={250}
          />
          {[1, 2, 3, 4].map((number) => (
            <Field
              key={number}
              id={`field-pollOption-${number}`}
              label={formatFromCopy(copy, 'composer.newThread.option', { number })}
              name="pollOption"
              maxLength={200}
            />
          ))}
        </Disclosure>
      )}

      {canSubscribe && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="subscribe" value="1" className="size-4" />
          <span>{fromCopy(copy, 'composer.notifyReplies')}</span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton className="w-auto">
          {fromCopy(copy, 'composer.newThread.submit')}
        </SubmitButton>
        <ComposerIntents />
      </div>
    </form>
  )
}
