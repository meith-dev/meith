import type { Translator } from '@meith/i18n'
import {
  SETTING_DEFINITIONS,
  type SettingDefinition,
  type SettingField,
  type SettingGroup,
  type SettingsSnapshot,
  secretClearField,
  settingField,
} from '@meith/settings'

import { GROUP_LABELS, GROUP_ORDER } from './setting-groups'
import { untranslated } from './time'

export { DEFAULT_SETTING_GROUP, SETTING_GROUP_NAV } from './setting-groups'

export interface SettingFieldModel {
  readonly key: string
  readonly label: string
  readonly description: string
  readonly field: SettingField
  readonly value: string
  readonly checked: boolean
  readonly isDefault: boolean
  readonly advanced: boolean
  readonly clearName: string | null
}

export interface SettingGroupModel {
  readonly group: SettingGroup
  readonly label: string
  readonly settings: readonly SettingFieldModel[]
}

export interface AdminSettingsModel {
  readonly groups: readonly SettingGroupModel[]
  readonly tabs: readonly { readonly group: SettingGroup; readonly label: string }[]
  readonly query: string
  readonly activeGroup: SettingGroup | null
  readonly showAdvanced: boolean
  readonly hiddenAdvanced: number
  readonly total: number
}

function matches(definition: SettingDefinition, copy: SettingCopy, query: string): boolean {
  if (query === '') return true
  const needle = query.toLowerCase()
  return (
    definition.key.toLowerCase().includes(needle) ||
    copy.label.toLowerCase().includes(needle) ||
    copy.description.toLowerCase().includes(needle)
  )
}

interface SettingCopy {
  readonly label: string
  readonly description: string
}

export function settingCopy(definition: SettingDefinition, translator: Translator): SettingCopy {
  const label = `setting.${definition.key}.label`
  const description = `setting.${definition.key}.description`

  return {
    label: translator.has(label) ? translator.t(label) : definition.label,
    description: translator.has(description) ? translator.t(description) : definition.description,
  }
}

export function settingGroupLabel(group: SettingGroup, translator: Translator): string {
  const key = `setting.group.${group}`
  return translator.has(key) ? translator.t(key) : GROUP_LABELS[group]
}

function formValue(definition: SettingDefinition, current: unknown): string {
  if (definition.secret === true) return ''
  if (typeof current === 'boolean') return current ? '1' : ''
  return String(current ?? '')
}

export function buildAdminSettingsModel(input: {
  readonly snapshot: SettingsSnapshot
  readonly query?: string | undefined
  readonly group?: string | undefined
  readonly advanced?: boolean | undefined
  readonly t?: Translator | undefined
}): AdminSettingsModel {
  const translator = input.t ?? untranslated()
  const query = (input.query ?? '').trim()
  const showAdvanced = input.advanced === true
  const searching = query !== ''

  const requested = GROUP_ORDER.find((group) => group === input.group)
  const activeGroup = searching ? null : (requested ?? GROUP_ORDER[0]!)

  let hiddenAdvanced = 0
  const groups: SettingGroupModel[] = []

  for (const group of GROUP_ORDER) {
    if (activeGroup !== null && group !== activeGroup) continue

    const settings: SettingFieldModel[] = []
    for (const definition of SETTING_DEFINITIONS) {
      if (definition.group !== group) continue
      const copy = settingCopy(definition, translator)
      if (!matches(definition, copy, query)) continue

      if (definition.ui?.managed === true) continue

      const advanced = definition.ui?.advanced === true
      if (advanced && !showAdvanced) {
        hiddenAdvanced += 1
        continue
      }

      const current = input.snapshot.get(definition.key as never) as unknown
      const isDefault = Object.is(current, definition.default)
      settings.push({
        key: definition.key,
        label: copy.label,
        description: copy.description,
        field: settingField(definition),
        value: formValue(definition, current),
        checked: current === true,
        isDefault,
        advanced,
        clearName:
          definition.secret === true && !isDefault ? secretClearField(definition.key) : null,
      })
    }

    if (settings.length > 0) {
      groups.push({ group, label: settingGroupLabel(group, translator), settings })
    }
  }

  return {
    groups,
    tabs: GROUP_ORDER.map((group) => ({ group, label: settingGroupLabel(group, translator) })),
    query,
    activeGroup,
    showAdvanced,
    hiddenAdvanced,
    total: groups.reduce((count, group) => count + group.settings.length, 0),
  }
}

export function settingsHref(input: {
  readonly group?: SettingGroup | null
  readonly query?: string
  readonly advanced?: boolean
}): string {
  const params = new URLSearchParams()
  if (input.query !== undefined && input.query !== '') params.set('q', input.query)
  else if (input.group != null) params.set('group', input.group)
  if (input.advanced === true) params.set('advanced', '1')

  const search = params.toString()
  return search === '' ? '/admin/settings' : `/admin/settings?${search}`
}
