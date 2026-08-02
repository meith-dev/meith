/**
 * F64 — what control a setting is edited with.
 *
 * F08 promised that "adding a setting means adding one entry — not an entry
 * plus a form field plus a migration plus a parser, each of which could
 * disagree with the others". This is the half that makes the form.
 *
 * **The kind is derived, not declared.** `typeof definition.default` already
 * says whether a setting is a string, a number or a boolean, and it says so as
 * a *value* rather than as a type — which is the same reason the CLI's `coerce`
 * reads it. A declared `kind` would be a second statement of the same fact,
 * free to drift from the schema that actually validates.
 *
 * What cannot be derived is declared, in `ui`, and only that: whether a string
 * wants a textarea, what an enum's choices are called, what bounds a number
 * input should advertise, and whether a setting is advanced enough to hide by
 * default.
 *
 * **The bounds are a duplicate, and there is a test that says so.**
 * `z.number().int().min(0).max(3600)` already knows the range, and zod schemas
 * are not introspectable for it without unwrapping every wrapper type. So the
 * hint restates it — and `fields.test.ts` probes each schema at the declared
 * bounds and one step outside them, so a hint that disagrees with its validator
 * fails rather than quietly offering a spinner that produces refusals.
 */
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
  /** A stored secret. Rendered as a password box and never echoed back. */
  | { readonly kind: 'secret' }

/**
 * The control for one setting.
 *
 * `secret` wins over everything: a secret that is also an enum is still a thing
 * whose current value must not reach the page.
 */
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

/**
 * Turn what a form submitted into what the schema expects.
 *
 * The counterpart of the CLI's `coerce`, and separate from it because a form
 * and a shell disagree about exactly one thing: **an unchecked checkbox
 * submits nothing at all**, so a boolean's absence is `false` rather than
 * "leave it alone". Sharing one function would mean the CLI treating a missing
 * argument as `false`, which is how `settings:set` would start silently
 * turning things off.
 *
 * Returns `undefined` for a secret whose box was left blank — the form never
 * receives the current value, so an empty box means "unchanged" and must not
 * become "set it to empty".
 */
export function coerceFormValue(
  definition: SettingDefinition,
  raw: string | undefined,
): unknown {
  if (typeof definition.default === 'boolean') return raw !== undefined && raw !== ''
  if (definition.secret === true && (raw === undefined || raw === '')) return undefined
  if (raw === undefined) return undefined

  if (typeof definition.default === 'number') {
    const value = Number(raw)
    /*
     * `Number('')` is 0 and `Number('abc')` is NaN, and both would reach the
     * schema as a number. Passing the raw string through instead lets zod
     * report "expected number" against the field, which is the message an
     * operator can act on.
     */
    return raw.trim() === '' || Number.isNaN(value) ? raw : value
  }

  return raw
}
