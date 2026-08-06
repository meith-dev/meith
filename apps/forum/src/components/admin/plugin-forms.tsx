"use client"

import { useActionState } from "react"

import { EMPTY_STATE } from "@/server/auth-form-state"
import {
  savePluginSettingsAction,
  setPluginEnabledAction,
} from "@/server/plugin-admin-actions"

import { FormError, SubmitButton } from "../auth/form-controls"

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

export interface PluginSettingField {
  readonly key: string
  readonly label: string
  readonly description: string | null
  readonly advanced: boolean
  readonly kind: "string" | "number" | "boolean"
  readonly default: string | number | boolean
  readonly value: string | number | boolean
}

export function PluginEnableForm({
  pluginKey,
  enabled,
}: {
  pluginKey: string
  enabled: boolean
}) {
  const [state, action] = useActionState(setPluginEnabledAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="key" value={pluginKey} />
      <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm"
      >
        {enabled ? "Disable" : "Enable"}
      </button>
    </form>
  )
}

export function PluginSettingsForm({
  pluginKey,
  settings,
}: {
  pluginKey: string
  settings: readonly PluginSettingField[]
}) {
  const [state, action] = useActionState(savePluginSettingsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      {state.notice === "saved" && (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Saved. The plugin reads these on its next call.
        </p>
      )}

      <input type="hidden" name="key" value={pluginKey} />

      <div className="flex flex-col divide-y divide-border">
        {settings.map((setting) => (
          <div key={setting.key} className="flex flex-col gap-1 py-3">
            {setting.kind === "boolean" ? (
              <label className="flex items-start gap-2 text-sm">
                { }
                <input
                  type="checkbox"
                  name={`setting.${setting.key}`}
                  value="1"
                  defaultChecked={setting.value === true}
                  className="mt-1"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{setting.label}</span>
                  {setting.description !== null && (
                    <span className="text-xs text-muted-foreground">{setting.description}</span>
                  )}
                </span>
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{setting.label}</span>
                <input
                  name={`setting.${setting.key}`}
                  type={setting.kind === "number" ? "number" : "text"}
                  defaultValue={String(setting.value)}
                  className={INPUT}
                />
                {setting.description !== null && (
                  <span className="text-xs text-muted-foreground">{setting.description}</span>
                )}
              </label>
            )}

            <span className="text-xs text-muted-foreground">
              <code className="text-xs">plugin.{pluginKey}.{setting.key}</code>
              {" · ships as "}
              {typeof setting.default === "boolean"
                ? setting.default
                  ? "on"
                  : "off"
                : String(setting.default)}
              {setting.advanced && " · advanced"}
            </span>
          </div>
        ))}
      </div>

      <span className="min-w-40 max-w-48">
        <SubmitButton>Save settings</SubmitButton>
      </span>
    </form>
  )
}
