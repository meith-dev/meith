'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  clearPluginHealthAction,
  savePluginSettingsAction,
  setPluginEnabledAction,
} from '@/server/plugin-admin-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { INPUT, Saved } from './form-bits'

export interface PluginSettingField {
  readonly key: string
  readonly label: string
  readonly description: string | null
  readonly advanced: boolean
  readonly kind: 'string' | 'secret' | 'number' | 'boolean' | 'select'
  readonly default: string | number | boolean
  readonly value: string | number | boolean
  readonly source: 'environment' | 'board' | 'default'
  readonly set: boolean
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly envName: string | null
  readonly problem: string | null
}

export function PluginEnableForm({
  pluginKey,
  enabled,
  copy,
}: {
  pluginKey: string
  enabled: boolean
  copy: Copy
}) {
  const [state, action] = useActionState(setPluginEnabledAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="key" value={pluginKey} />
      <input type="hidden" name="enabled" value={enabled ? '0' : '1'} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm"
      >
        {enabled
          ? fromCopy(copy, 'adminPanel.plugin.disable')
          : fromCopy(copy, 'adminPanel.plugin.enable')}
      </button>
    </form>
  )
}

export function PluginHealthResetForm({ pluginKey, copy }: { pluginKey: string; copy: Copy }) {
  const [state, action] = useActionState(clearPluginHealthAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="key" value={pluginKey} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm"
      >
        {fromCopy(copy, 'adminPanel.plugin.clearFailures')}
      </button>
    </form>
  )
}

export function PluginSettingsForm({
  pluginKey,
  settings,
  copy,
}: {
  pluginKey: string
  settings: readonly PluginSettingField[]
  copy: Copy
}) {
  const [state, action] = useActionState(savePluginSettingsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'adminPanel.plugin.saved')}</Saved>

      <input type="hidden" name="key" value={pluginKey} />

      <div className="flex flex-col divide-y divide-border">
        {settings.map((setting) => {
          const fromEnvironment = setting.source === 'environment'

          return (
            <div key={setting.key} className="flex flex-col gap-1 py-3">
              {setting.kind === 'boolean' ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`setting.${setting.key}`}
                    value="1"
                    defaultChecked={setting.value === true}
                    disabled={fromEnvironment}
                    className="mt-1"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{setting.label}</span>
                    {setting.description !== null && (
                      <span className="text-xs text-muted-foreground">{setting.description}</span>
                    )}
                  </span>
                </label>
              ) : setting.kind === 'select' ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{setting.label}</span>
                  <select
                    name={`setting.${setting.key}`}
                    defaultValue={String(setting.value)}
                    disabled={fromEnvironment}
                    className={INPUT}
                  >
                    {setting.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {setting.description !== null && (
                    <span className="text-xs text-muted-foreground">{setting.description}</span>
                  )}
                </label>
              ) : setting.kind === 'secret' ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{setting.label}</span>
                  <input
                    name={`setting.${setting.key}`}
                    type="password"
                    autoComplete="new-password"
                    defaultValue=""
                    placeholder={
                      fromEnvironment
                        ? fromCopy(copy, 'adminPanel.plugin.secretFromEnvPlaceholder')
                        : setting.set
                          ? fromCopy(copy, 'adminPanel.plugin.secretSetPlaceholder')
                          : fromCopy(copy, 'adminPanel.plugin.secretNotSetPlaceholder')
                    }
                    disabled={fromEnvironment}
                    className={INPUT}
                  />
                  {setting.description !== null && (
                    <span className="text-xs text-muted-foreground">{setting.description}</span>
                  )}
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{setting.label}</span>
                  <input
                    name={`setting.${setting.key}`}
                    type={setting.kind === 'number' ? 'number' : 'text'}
                    defaultValue={String(setting.value)}
                    disabled={fromEnvironment}
                    className={INPUT}
                  />
                  {setting.description !== null && (
                    <span className="text-xs text-muted-foreground">{setting.description}</span>
                  )}
                </label>
              )}

              {setting.problem !== null && (
                <span className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs">
                  {setting.problem}
                </span>
              )}

              <span className="text-xs text-muted-foreground">
                <code className="text-xs">
                  plugin.{pluginKey}.{setting.key}
                </code>
                {fromEnvironment && setting.envName !== null && (
                  <>
                    {copy['adminPanel.plugin.envInertLead']}
                    <code className="text-xs">{setting.envName}</code>
                    {copy['adminPanel.plugin.envInertTail']}
                  </>
                )}
                {!fromEnvironment && setting.envName !== null && (
                  <>
                    {copy['adminPanel.plugin.envOverridesLead']}
                    <code className="text-xs">{setting.envName}</code>
                    {copy['adminPanel.plugin.envOverridesTail']}
                  </>
                )}
                {setting.kind !== 'secret' &&
                  formatFromCopy(copy, 'adminPanel.plugin.shipsAs', {
                    value:
                      typeof setting.default === 'boolean'
                        ? setting.default
                          ? fromCopy(copy, 'adminPanel.plugin.on')
                          : fromCopy(copy, 'adminPanel.plugin.off')
                        : String(setting.default) === ''
                          ? fromCopy(copy, 'adminPanel.plugin.empty')
                          : String(setting.default),
                  })}
                {setting.advanced && fromCopy(copy, 'adminPanel.plugin.advanced')}
              </span>
            </div>
          )
        })}
      </div>

      <span className="min-w-40 max-w-48">
        <SubmitButton>{fromCopy(copy, 'adminPanel.plugin.save')}</SubmitButton>
      </span>
    </form>
  )
}
