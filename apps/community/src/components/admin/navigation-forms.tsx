'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  createNavigationItemAction,
  deleteNavigationItemAction,
  updateNavigationItemAction,
} from '@/server/navigation-admin-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'
import { INPUT, Saved } from './form-bits'

export interface AudienceChoice {
  readonly value: string
  readonly label: string
}

export interface GroupChoice {
  readonly id: number
  readonly title: string
}

export interface NavigationItemValues {
  readonly id: number
  readonly label: string
  readonly href: string
  readonly displayOrder: number
  readonly audience: string
  readonly newTab: boolean
  readonly enabled: boolean
  readonly visibleToGroups: readonly number[]
}

function NavigationFields({
  audiences,
  groups,
  values,
  copy,
}: {
  audiences: readonly AudienceChoice[]
  groups: readonly GroupChoice[]
  values?: NavigationItemValues
  copy: Copy
}) {
  const chosen = new Set(values?.visibleToGroups ?? [])

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminNavigation.label')}</span>
          <input name="label" defaultValue={values?.label ?? ''} className={INPUT} />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminNavigation.labelHint')}
          </span>
        </label>

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminNavigation.address')}</span>
          <input name="href" defaultValue={values?.href ?? ''} className={INPUT} required />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminNavigation.addressHint')}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-28 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminNavigation.displayOrder')}</span>
          <input
            name="displayOrder"
            type="number"
            min={0}
            defaultValue={values?.displayOrder ?? 0}
            className={INPUT}
          />
        </label>

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminNavigation.audience')}</span>
          <select name="audience" defaultValue={values?.audience ?? 'all'} className={INPUT}>
            {audiences.map((audience) => (
              <option key={audience.value} value={audience.value}>
                {audience.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {groups.length > 0 && (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">{fromCopy(copy, 'adminNavigation.groups')}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {groups.map((group) => (
              <label key={group.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="groups"
                  value={group.id}
                  defaultChecked={chosen.has(group.id)}
                  className="size-4"
                />
                <span>{group.title}</span>
              </label>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminNavigation.groupsHint')}
          </span>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="newTab"
            value="1"
            defaultChecked={values?.newTab ?? false}
            className="size-4"
          />
          <span>{fromCopy(copy, 'adminNavigation.newTab')}</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={values?.enabled ?? true}
            className="size-4"
          />
          <span>{fromCopy(copy, 'adminNavigation.shown')}</span>
        </label>
      </div>
    </>
  )
}

export function NavigationItemRowForm({
  item,
  audiences,
  groups,
  copy,
}: {
  item: NavigationItemValues
  audiences: readonly AudienceChoice[]
  groups: readonly GroupChoice[]
  copy: Copy
}) {
  const [state, action] = useActionState(updateNavigationItemAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteNavigationItemAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-3 py-4">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>

      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={item.id} />
        <NavigationFields audiences={audiences} groups={groups} values={item} copy={copy} />

        <span className="min-w-28">
          <SubmitButton>{fromCopy(copy, 'adminContent.save')}</SubmitButton>
        </span>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={item.id} />
        <button type="submit" className="text-xs text-destructive hover:underline">
          {fromCopy(copy, 'adminNavigation.removeThis')}
        </button>
      </form>
    </div>
  )
}

export function NewNavigationItemForm({
  audiences,
  groups,
  copy,
}: {
  audiences: readonly AudienceChoice[]
  groups: readonly GroupChoice[]
  copy: Copy
}) {
  const [state, action] = useActionState(createNavigationItemAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'adminContent.added')}</Saved>

      <NavigationFields audiences={audiences} groups={groups} copy={copy} />

      <span className="min-w-28">
        <SubmitButton>{fromCopy(copy, 'adminContent.add')}</SubmitButton>
      </span>
    </form>
  )
}
