"use client"

import { useActionState } from "react"

import type { SettingFieldModel, SettingGroupModel } from "@/view/admin-settings"
import { saveAdminSettingsAction } from "@/server/admin-settings-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"
import { INPUT } from "./form-bits"

function Control({ setting }: { setting: SettingFieldModel }) {
  const { field, key, value } = setting

  switch (field.kind) {
    case "boolean":
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
    case "number":
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
    case "textarea":
      return (
        <textarea id={key} name={key} rows={4} defaultValue={value} className={INPUT} />
      )
    case "select":
      return (
        <select id={key} name={key} defaultValue={value} className={INPUT}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case "secret":
      return (
        <input
          id={key}
          type="password"
          name={key}
          placeholder="Unchanged"
          autoComplete="off"
          className={INPUT}
        />
      )
    default:
      return <input id={key} type="text" name={key} defaultValue={value} className={INPUT} />
  }
}

export function AdminSettingsForm({ groups }: { groups: readonly SettingGroupModel[] }) {
  const [state, action] = useActionState(saveAdminSettingsAction, EMPTY_STATE)

  const keys = groups.flatMap((group) => group.settings.map((setting) => setting.key))

  if (keys.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No settings match that search.
      </p>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      <FormError message={state.error} />
      {state.notice === "saved" && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Saved, and the caches those settings declare have been cleared.
        </p>
      )}
      {state.notice === "unchanged" && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Nothing was different, so nothing was written.
        </p>
      )}

      <input type="hidden" name="keys" value={keys.join(",")} />

      {groups.map((group) => (
        <section key={group.group} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{group.label}</h2>
          <div className="flex flex-col gap-5">
            {group.settings.map((setting) => (
              <div key={setting.key} className="flex flex-col gap-1">
                <label htmlFor={setting.key} className="flex items-center gap-2 text-sm font-medium">
                  {setting.field.kind === "boolean" && <Control setting={setting} />}
                  <span>{setting.label}</span>
                  {setting.advanced && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Advanced
                    </span>
                  )}
                  {!setting.isDefault && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Changed
                    </span>
                  )}
                </label>
                {setting.field.kind !== "boolean" && <Control setting={setting} />}
                <p className="text-xs text-muted-foreground">{setting.description}</p>
                <code className="text-[10px] text-muted-foreground">{setting.key}</code>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div>
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </form>
  )
}
