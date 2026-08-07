/**
 * F64's pure view model.
 *
 * The whole screen is a function of the registry and a snapshot. Nothing here
 * knows a setting by name, which is F08's promise kept: adding a setting is one
 * entry in `definitions.ts` and it appears, in its group, searchable, with the
 * right control.
 *
 * Two decisions worth reading.
 *
 * **The search matches the label and the description, not the key.** An
 * operator looking for "how long before somebody is locked out" types
 * *lockout*, and the key `security.lockout_minutes` contains it — but so does
 * the description, which is where the words they actually know live. Matching
 * both, and showing which group a hit is in, is what makes the box worth having
 * on a screen with twenty-six settings.
 *
 * **A search shows every group at once; browsing shows one.** Filtering to a
 * group *and* a term would mean an operator who typed a word and saw nothing
 * had to work out that they were also filtered — which is the classic way a
 * search box gets called broken.
 */
import {
  SETTING_DEFINITIONS,
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
  /** The current value as a form holds it. Never populated for a secret. */
  readonly value: string
  readonly checked: boolean
  readonly isDefault: boolean
  readonly advanced: boolean
}

export interface SettingGroupModel {
  readonly group: SettingGroup
  readonly label: string
  readonly settings: readonly SettingFieldModel[]
}

export interface AdminSettingsModel {
  readonly groups: readonly SettingGroupModel[]
  /** Every group, for the navigation, whatever the current filter shows. */
  readonly tabs: readonly { readonly group: SettingGroup; readonly label: string }[]
  readonly query: string
  readonly activeGroup: SettingGroup | null
  readonly showAdvanced: boolean
  /** How many settings the current filter is hiding because they are advanced. */
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

/** The value as a form holds it — always a string, never a secret's. */
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
  /*
   * A search spans every group; browsing defaults to the first. The `null`
   * active group is what tells the screen no tab is selected.
   */
  const activeGroup = searching ? null : (requested ?? GROUP_ORDER[0]!)

  let hiddenAdvanced = 0
  const groups: SettingGroupModel[] = []

  for (const group of GROUP_ORDER) {
    if (activeGroup !== null && group !== activeGroup) continue

    const settings: SettingFieldModel[] = []
    for (const definition of SETTING_DEFINITIONS) {
      if (definition.group !== group) continue
      if (!matches(definition, query)) continue

      /*
       * A `managed` setting has a screen of its own — the logo's storage key is
       * written by an upload, not typed — so the generated form does not draw
       * it at all. Not even under "advanced": advanced means "hidden until you
       * ask", and this is "not editable here at any point".
       */
      if (definition.ui?.managed === true) continue

      const advanced = definition.ui?.advanced === true
      if (advanced && !showAdvanced) {
        hiddenAdvanced += 1
        continue
      }

      const current = input.snapshot.get(definition.key as never) as unknown
      settings.push({
        key: definition.key,
        label: definition.label,
        description: definition.description,
        field: settingField(definition),
        value: formValue(definition, current),
        checked: current === true,
        /*
         * Shown as a hint rather than used to hide anything. An operator
         * wondering "have I changed this?" is asking a real question, and the
         * store answers it by construction — a value equal to the default is
         * never written.
         */
        isDefault: Object.is(current, definition.default),
        advanced,
      })
    }

    /* A group with no hits under the current filter is left out entirely. */
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

/** The screen's own URL under one set of filters. Used by every control on it. */
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
