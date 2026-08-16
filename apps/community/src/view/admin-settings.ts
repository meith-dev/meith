import {
  SETTING_DEFINITIONS,
  secretClearField,
  settingField,
  type SettingDefinition,
  type SettingField,
  type SettingGroup,
  type SettingsSnapshot,
} from '@meith/settings'

import { GROUP_LABELS, GROUP_ORDER } from './setting-groups'

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

function matches(definition: SettingDefinition, query: string): boolean {
  if (query === '') return true
  const needle = query.toLowerCase()
  return (
    definition.key.toLowerCase().includes(needle) ||
    definition.label.toLowerCase().includes(needle) ||
    definition.description.toLowerCase().includes(needle)
  )
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
}): AdminSettingsModel {
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
      if (!matches(definition, query)) continue

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
        label: definition.label,
        description: definition.description,
        field: settingField(definition),
        value: formValue(definition, current),
        checked: current === true,
        isDefault,
        advanced,
        clearName:
          definition.secret === true && !isDefault
            ? secretClearField(definition.key)
            : null,
      })
    }

    if (settings.length > 0) {
      groups.push({ group, label: GROUP_LABELS[group], settings })
    }
  }

  return {
    groups,
    tabs: GROUP_ORDER.map((group) => ({ group, label: GROUP_LABELS[group] })),
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
