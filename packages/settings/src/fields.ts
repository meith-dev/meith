import type { SettingDefinition } from './definitions'

export interface SettingOption {
  readonly value: string
  readonly label: string
}

export type SettingField =
  | { readonly kind: 'text' }
  | { readonly kind: 'textarea' }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'number'; readonly min?: number; readonly max?: number }
  | { readonly kind: 'select'; readonly options: readonly SettingOption[] }
  | { readonly kind: 'secret' }

export function settingField(definition: SettingDefinition): SettingField {
  if (definition.secret === true) return { kind: 'secret' }

  const ui = definition.ui
  if (ui?.options !== undefined) return { kind: 'select', options: ui.options }

  switch (typeof definition.default) {
    case 'boolean':
      return { kind: 'boolean' }
    case 'number':
      return {
        kind: 'number',
        ...(ui?.min === undefined ? {} : { min: ui.min }),
        ...(ui?.max === undefined ? {} : { max: ui.max }),
      }
    default:
      return ui?.multiline === true ? { kind: 'textarea' } : { kind: 'text' }
  }
}

export function secretClearField(key: string): string {
  return `${key}__clear`
}

export function coerceFormValue(
  definition: SettingDefinition,
  raw: string | undefined,
  options: { readonly clear?: boolean } = {},
): unknown {
  if (typeof definition.default === 'boolean') return raw !== undefined && raw !== ''
  if (definition.secret === true) {
    if (options.clear === true) return definition.default
    if (raw === undefined || raw === '') return undefined
  }
  if (raw === undefined) return undefined

  if (typeof definition.default === 'number') {
    const value = Number(raw)
    return raw.trim() === '' || Number.isNaN(value) ? raw : value
  }

  return raw
}
