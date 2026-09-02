'use client'

import type { ReactNode } from 'react'
import { useActionState, useEffect, useState } from 'react'

import type { UploadLimits } from '@meith/attachments/limits'
import type { Draft } from '@meith/drafts'
import { POLL_OPTION_MAX } from '@meith/polls/limits'
import { buttonVariants, Disclosure } from '@meith/ui'

import type { PollDraftValues } from '@/server/auth-form-state'
import { EMPTY_STATE } from '@/server/auth-form-state'
import { createThreadAction } from '@/server/content-actions'

import { Field, FormError, PendingButton, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { AttachmentField } from './attachment-field'
import { ComposerIntents } from './composer-intents'
import { ComposerRecovery } from './composer-recovery'
import { MarkdownEditor } from './markdown-editor'

export interface PrefixOption {
  readonly id: number
  readonly label: string
}

const POLL_OPTION_STARTING_SLOTS = 4
const POLL_OPTION_ADD_STEP = 4

function PollOptionFields({
  pollDraft,
  copy,
}: {
  pollDraft: PollDraftValues | undefined
  copy: Copy
}) {
  const [slots, setSlots] = useState(() =>
    Math.max(pollDraft?.options.length ?? 0, POLL_OPTION_STARTING_SLOTS),
  )

  useEffect(() => {
    setSlots(Math.max(pollDraft?.options.length ?? 0, POLL_OPTION_STARTING_SLOTS))
  }, [pollDraft])

  const atMax = slots >= POLL_OPTION_MAX

  return (
    <>
      {Array.from({ length: slots }, (_, index) => (
        <Field
          // biome-ignore lint/suspicious/noArrayIndexKey: slots are appended only, in stable order — the index is the slot number
          key={index}
          id={`field-pollOption-${index + 1}`}
          label={formatFromCopy(copy, 'composer.newThread.option', { number: index + 1 })}
          name="pollOption"
          maxLength={200}
          defaultValue={pollDraft?.options[index]}
        />
      ))}
      <PendingButton
        name="intent"
        value="more_options"
        disabled={atMax}
        onClick={(event) => {
          event.preventDefault()
          setSlots((current) => Math.min(current + POLL_OPTION_ADD_STEP, POLL_OPTION_MAX))
        }}
        className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-auto' })}
      >
        {fromCopy(copy, 'composer.newThread.morePollOptions')}
      </PendingButton>
    </>
  )
}

export function NewThreadForm({
  forumId,
  prefixes,
  requiresPrefix,
  canSubscribe,
  subscribeDefault = false,
  canPostPoll,
  attachmentLimits,
  draft,
  toolbar,
  copy,
}: {
  forumId: number
  prefixes: readonly PrefixOption[]
  requiresPrefix: boolean
  canSubscribe: boolean
  subscribeDefault?: boolean
  canPostPoll: boolean
  attachmentLimits: UploadLimits | null
  draft: Draft | null
  toolbar?: ReactNode
  copy: Copy
}) {
  const [state, action] = useActionState(createThreadAction, EMPTY_STATE)
  const pollDraft = state.poll

  const hasPollDraft =
    (pollDraft?.question ?? '') !== '' ||
    (pollDraft?.options.some((option) => option.trim() !== '') ?? false)

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
            defaultValue={pollDraft?.question}
          />
          <PollOptionFields pollDraft={pollDraft} copy={copy} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{fromCopy(copy, 'composer.newThread.pollChoices')}</span>
            <input
              type="number"
              name="pollMaxOptions"
              min={0}
              step={1}
              defaultValue={pollDraft?.maxOptions ?? '1'}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span className="text-xs text-muted-foreground">
              {fromCopy(copy, 'composer.newThread.pollChoicesHint')}
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="pollAllowRevote"
              value="1"
              defaultChecked={pollDraft?.allowRevote ?? false}
              className="size-4"
            />
            <span>{fromCopy(copy, 'composer.newThread.pollRevote')}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="pollPublicVotes"
              value="1"
              defaultChecked={pollDraft?.publicVotes ?? false}
              className="size-4"
            />
            <span>{fromCopy(copy, 'composer.newThread.pollPublic')}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{fromCopy(copy, 'pollEdit.closesAt')}</span>
            <input
              type="datetime-local"
              name="pollClosesAt"
              defaultValue={pollDraft?.closesAt ?? ''}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span className="text-xs text-muted-foreground">
              {fromCopy(copy, 'pollEdit.closesAtHint')}
            </span>
          </label>
        </Disclosure>
      )}

      {canSubscribe && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="subscribe"
            value="1"
            defaultChecked={subscribeDefault}
            className="size-4"
          />
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
