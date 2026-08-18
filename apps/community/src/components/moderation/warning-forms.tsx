'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { issueWarningAction, revokeWarningAction } from '@/server/warning-actions'

import { FormError } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const FIELD =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export interface WarningTypeOption {
  readonly id: number
  readonly label: string
}

export function IssueWarningForm({
  userId,
  postId,
  types,
  copy,
}: {
  userId: number
  postId: number | null
  types: readonly WarningTypeOption[]
  copy: Copy
}) {
  const [state, action] = useActionState(issueWarningAction, EMPTY_STATE)

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <h2 className="text-lg font-semibold tracking-tight">
        {fromCopy(copy, 'moderationForm.warn.title')}
      </h2>
      <FormError message={state.error} />

      <input type="hidden" name="userId" value={userId} />
      {postId !== null && <input type="hidden" name="postId" value={postId} />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'moderationForm.warn.reason')}</span>
        <select name="typeId" className={FIELD} defaultValue="">
          <option value="">{fromCopy(copy, 'moderationForm.warn.somethingElse')}</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'moderationForm.warn.titleLabel')}</span>
          <input type="text" name="title" maxLength={150} className={FIELD} />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'moderationForm.warn.titleHint')}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'moderationForm.warn.points')}</span>
          <input type="number" name="points" min={1} max={100} className={FIELD} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'moderationForm.warn.what')}</span>
        <textarea name="reason" rows={4} maxLength={2000} className={FIELD} required />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'moderationForm.warn.whatHint')}
        </span>
      </label>

      <div>
        <button type="submit" className={BUTTON}>
          {fromCopy(copy, 'moderationForm.warn.submit')}
        </button>
      </div>
    </form>
  )
}

export function RevokeWarningForm({
  warningId,
  userId,
  copy,
}: {
  warningId: number
  userId: number
  copy: Copy
}) {
  const [state, action] = useActionState(revokeWarningAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="warningId" value={warningId} />
      <input type="hidden" name="userId" value={userId} />
      <label className="flex-1">
        <span className="sr-only">{fromCopy(copy, 'moderationForm.warn.revokeSr')}</span>
        <input
          type="text"
          name="reason"
          maxLength={2000}
          placeholder={fromCopy(copy, 'moderationForm.warn.revokePlaceholder')}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </label>
      <button
        type="submit"
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-border px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {fromCopy(copy, 'moderationForm.warn.revoke')}
      </button>
    </form>
  )
}
