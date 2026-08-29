'use client'

import { useActionState } from 'react'

import { BOARD_MEASURE } from '@/components/shell/measure'
import { EMPTY_STATE } from '@/server/auth-form-state'
import { inlineModerateAction } from '@/server/inline-moderation-actions'
import { splitSelectedAction } from '@/server/surgery-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const BUTTON =
  'inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export interface InlineMoveOption {
  readonly id: number
  readonly title: string
}

export interface InlineToolRights {
  readonly approve: boolean
  readonly lock: boolean
  readonly stick: boolean
  readonly move: boolean
  readonly delete: boolean
  readonly restore: boolean
}

export function InlineModerationForm({
  formId,
  scope,
  rights,
  moveTargets,
  returnTo,
  splitFrom,
  copy,
}: {
  formId: string
  scope: 'threads' | 'posts'
  rights: InlineToolRights
  moveTargets: readonly InlineMoveOption[]
  returnTo: string
  splitFrom?: number | null
  copy: Copy
}) {
  const [state, action] = useActionState(inlineModerateAction, EMPTY_STATE)
  const [splitState, splitAction] = useActionState(splitSelectedAction, EMPTY_STATE)

  return (
    <div className={`${BOARD_MEASURE} mb-6`}>
      <form
        id={formId}
        action={action}
        aria-label={
          scope === 'threads'
            ? fromCopy(copy, 'moderationForm.inline.moderateThreads')
            : fromCopy(copy, 'moderationForm.inline.moderatePosts')
        }
        className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3"
      >
        <FormError message={state.error} />
        <FormError message={splitState.error} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <span className="text-xs font-medium text-muted-foreground">
          {scope === 'threads'
            ? fromCopy(copy, 'moderationForm.inline.withThreads')
            : fromCopy(copy, 'moderationForm.inline.withPosts')}
        </span>

        {rights.approve && (
          <PendingButton name="tool" value="approve" className={BUTTON}>
            {fromCopy(copy, 'moderationForm.inline.approve')}
          </PendingButton>
        )}
        {rights.lock && scope === 'threads' && (
          <>
            <PendingButton name="tool" value="lock" className={BUTTON}>
              {fromCopy(copy, 'moderationForm.tool.lock')}
            </PendingButton>
            <PendingButton name="tool" value="unlock" className={BUTTON}>
              {fromCopy(copy, 'moderationForm.tool.unlock')}
            </PendingButton>
          </>
        )}
        {rights.stick && scope === 'threads' && (
          <>
            <PendingButton name="tool" value="stick" className={BUTTON}>
              {fromCopy(copy, 'moderationForm.tool.pin')}
            </PendingButton>
            <PendingButton name="tool" value="unstick" className={BUTTON}>
              {fromCopy(copy, 'moderationForm.tool.unpin')}
            </PendingButton>
          </>
        )}
        {rights.restore && (
          <PendingButton name="tool" value="restore" className={BUTTON}>
            {fromCopy(copy, 'moderationForm.inline.restore')}
          </PendingButton>
        )}

        {rights.move && scope === 'threads' && moveTargets.length > 0 && (
          <span className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs">
              <span className="sr-only">{fromCopy(copy, 'moderationForm.moveTo')}</span>
              <select
                name="toForumId"
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {moveTargets.map((forum) => (
                  <option key={forum.id} value={forum.id}>
                    {forum.title}
                  </option>
                ))}
              </select>
            </label>
            <PendingButton name="tool" value="move" className={BUTTON}>
              {fromCopy(copy, 'moderationForm.tool.move')}
            </PendingButton>
          </span>
        )}

        {splitFrom != null && scope === 'posts' && (
          <span className="flex items-center gap-2">
            <input type="hidden" name="threadId" value={splitFrom} />
            <label className="flex items-center gap-2 text-xs">
              <span className="sr-only">
                {fromCopy(copy, 'moderationForm.inline.splitTitleSr')}
              </span>
              <input
                type="text"
                name="title"
                maxLength={150}
                placeholder={fromCopy(copy, 'moderationForm.newThreadTitle')}
                className="h-8 w-48 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <PendingButton formAction={splitAction} className={BUTTON}>
              {fromCopy(copy, 'moderationForm.inline.splitOut')}
            </PendingButton>
          </span>
        )}

        {rights.delete && (
          <PendingButton
            name="tool"
            value="delete"
            className={`${BUTTON} border-destructive/40 text-destructive`}
          >
            {fromCopy(copy, 'moderationForm.inline.delete')}
          </PendingButton>
        )}
      </form>
    </div>
  )
}
