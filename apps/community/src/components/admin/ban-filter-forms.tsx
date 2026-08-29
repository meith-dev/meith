'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { addBanFilterAction, removeBanFilterAction } from '@/server/ban-filter-admin-actions'

import { FormError, PendingButton, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { INPUT, Saved } from './form-bits'

export interface BanFilterTypeOption {
  readonly value: string
  readonly label: string
}

export function NewBanFilterForm({
  types,
  copy,
}: {
  types: readonly BanFilterTypeOption[]
  copy: Copy
}) {
  const [state, action] = useActionState(addBanFilterAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'created'}>{fromCopy(copy, 'adminBanFilter.added')}</Saved>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminBanFilter.type')}</span>
          <select
            name="type"
            defaultValue={state.values?.type ?? types[0]?.value ?? ''}
            className={INPUT}
          >
            {types.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminBanFilter.typeHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminBanFilter.pattern')}</span>
          <input
            name="pattern"
            defaultValue={state.values?.pattern ?? ''}
            className={INPUT}
            placeholder={fromCopy(copy, 'adminBanFilter.patternPlaceholder')}
            required
          />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminBanFilter.patternHint')}
          </span>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminBanFilter.note')}</span>
        <input name="note" defaultValue={state.values?.note ?? ''} className={INPUT} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminBanFilter.noteHint')}
        </span>
      </label>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminBanFilter.addFilter')}</SubmitButton>
      </div>
    </form>
  )
}

export function RemoveBanFilterForm({
  id,
  pattern,
  copy,
}: {
  id: number
  pattern: string
  copy: Copy
}) {
  const [state, action] = useActionState(removeBanFilterAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <FormError message={state.error} />
      <input type="hidden" name="id" value={id} />
      <PendingButton
        showWorking
        className="text-xs text-destructive hover:underline"
        aria-label={formatFromCopy(copy, 'adminBanFilter.removeFilter', { pattern })}
      >
        {fromCopy(copy, 'admin.remove')}
      </PendingButton>
    </form>
  )
}
