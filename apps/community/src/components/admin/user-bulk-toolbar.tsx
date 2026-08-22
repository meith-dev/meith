'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { bulkUserAction } from '@/server/user-admin-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import type { Copy } from '../shell/copy'
import { AdminUndo } from './admin-undo'
import { INPUT, Saved } from './form-bits'

interface Labels {
  readonly action: string
  readonly apply: string
  readonly ban: string
  readonly banned: string
  readonly choose: string
  readonly group: string
  readonly grouped: string
  readonly prune: string
  readonly pruneReview: string
  readonly reason: string
  readonly selectPage: string
}

export function UserBulkToolbar({
  groups,
  labels,
  copy,
}: {
  groups: readonly { readonly id: number; readonly title: string }[]
  labels: Labels
  copy: Copy
}) {
  const [state, action] = useActionState(bulkUserAction, EMPTY_STATE)
  const selection = state.values?.selection

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 text-card-foreground">
      <FormError message={state.error} />
      <Saved when={state.notice === 'bulk-banned'}>{labels.banned}</Saved>
      <Saved when={state.notice === 'bulk-grouped'}>{labels.grouped}</Saved>
      <AdminUndo undo={state.undo} copy={copy} />
      {selection !== undefined && (
        <a
          href={`/admin/users/prune?selection=${encodeURIComponent(selection)}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {labels.pruneReview}
        </a>
      )}
      <form
        id="admin-user-bulk"
        action={action}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="flex min-w-48 flex-col gap-1 text-sm">
          <span className="font-medium">{labels.action}</span>
          <select name="bulkAction" defaultValue="" className={INPUT} required>
            <option value="">{labels.choose}</option>
            <option value="ban">{labels.ban}</option>
            <option value="group">{labels.group}</option>
            <option value="prune">{labels.prune}</option>
          </select>
        </label>
        <label className="flex min-w-48 flex-col gap-1 text-sm">
          <span className="font-medium">{labels.group}</span>
          <select name="groupId" defaultValue="" className={INPUT}>
            <option value="">{labels.choose}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{labels.reason}</span>
          <input name="reason" className={INPUT} />
        </label>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium"
          onClick={() => {
            for (const checkbox of document.querySelectorAll<HTMLInputElement>(
              '[data-admin-user-select]',
            )) {
              checkbox.checked = true
            }
          }}
        >
          {labels.selectPage}
        </button>
        <SubmitButton>{labels.apply}</SubmitButton>
      </form>
    </div>
  )
}
