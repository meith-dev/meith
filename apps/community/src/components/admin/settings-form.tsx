'use client'

import { useActionState } from 'react'

import { cn } from '@meith/ui'

import { saveAdminSettingsAction } from '@/server/admin-settings-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'
import type { SettingFieldModel, SettingGroupModel } from '@/view/admin-settings'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'
import { PANEL_CARD } from '../shell/panel-list'
import { INPUT, Saved } from './form-bits'

function Control({ setting, copy }: { setting: SettingFieldModel; copy: Copy }) {
  const { field, key, value } = setting

  switch (field.kind) {
    case 'boolean':
      return (
        <input
          id={key}
          type="checkbox"
          name={key}
          value="1"
          defaultChecked={setting.checked}
          className="size-4"
        />
      )
    case 'number':
      return (
        <input
          id={key}
          type="number"
          name={key}
          defaultValue={value}
          min={field.min}
          max={field.max}
          className={INPUT}
        />
      )
    case 'textarea':
      return <textarea id={key} name={key} rows={4} defaultValue={value} className={INPUT} />
    case 'select':
      return (
        <select id={key} name={key} defaultValue={value} className={INPUT}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'secret':
      return (
        <div className="flex flex-col gap-1">
          <input
            id={key}
            type="password"
            name={key}
            placeholder={fromCopy(copy, 'adminPanel.setting.unchangedPlaceholder')}
            autoComplete="off"
            className={INPUT}
          />
          {setting.clearName !== null && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name={setting.clearName} value="1" className="size-4" />
              <span>{fromCopy(copy, 'adminPanel.setting.clearStored')}</span>
            </label>
          )}
        </div>
      )
    default:
      return <input id={key} type="text" name={key} defaultValue={value} className={INPUT} />
  }
}

export function AdminSettingsForm({
  groups,
  copy,
}: {
  groups: readonly SettingGroupModel[]
  copy: Copy
}) {
  const [state, action] = useActionState(saveAdminSettingsAction, EMPTY_STATE)

  const keys = groups.flatMap((group) => group.settings.map((setting) => setting.key))

  if (keys.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {fromCopy(copy, 'adminPanel.setting.noMatches')}
      </p>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'adminPanel.setting.saved')}</Saved>
      {state.notice === 'unchanged' && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {fromCopy(copy, 'adminPanel.setting.unchanged')}
        </p>
      )}

      <input type="hidden" name="keys" value={keys.join(',')} />

      {groups.map((group) => (
        <section key={group.group} className={cn(PANEL_CARD, 'gap-5')}>
          <h2 className="font-heading text-lg font-semibold">{group.label}</h2>
          <div className="flex flex-col gap-5">
            {group.settings.map((setting) => (
              <div key={setting.key} className="flex flex-col gap-1">
                <label
                  htmlFor={setting.key}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  {setting.field.kind === 'boolean' && <Control setting={setting} copy={copy} />}
                  <span>{setting.label}</span>
                  {setting.advanced && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {fromCopy(copy, 'adminPanel.setting.advanced')}
                    </span>
                  )}
                  {!setting.isDefault && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {fromCopy(copy, 'adminPanel.setting.changed')}
                    </span>
                  )}
                </label>
                {setting.field.kind !== 'boolean' && <Control setting={setting} copy={copy} />}
                <p className="text-xs text-muted-foreground">{setting.description}</p>
                <code className="text-[10px] text-muted-foreground">{setting.key}</code>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div>
        <SubmitButton>{fromCopy(copy, 'adminPanel.setting.save')}</SubmitButton>
      </div>
    </form>
  )
}
