import type { TokenKind } from './theme-tokens'

export type Scheme = 'light' | 'dark'

export const SCHEMES: readonly Scheme[] = ['light', 'dark']

export type FieldScheme = Scheme | 'both'

export interface EditableToken {
  readonly name: string
  readonly label: string
  readonly hint: string
  readonly kind: TokenKind
  readonly light: string
  readonly dark: string
  readonly overrideLight: string
  readonly overrideDark: string
}

export type Draft = Record<string, string>

export function fieldName(name: string, scheme: FieldScheme): string {
  return `token.${scheme}.${name}`
}

export function schemesFor(token: EditableToken): readonly FieldScheme[] {
  return token.kind === 'colour' ? ['light', 'dark'] : ['both']
}

export function shippedValue(token: EditableToken, scheme: FieldScheme): string {
  return scheme === 'dark' ? token.dark : token.light
}

export function savedValue(token: EditableToken, scheme: FieldScheme): string {
  return scheme === 'dark' ? token.overrideDark : token.overrideLight
}

export function draftValue(draft: Draft, token: EditableToken, scheme: FieldScheme): string {
  return (draft[fieldName(token.name, scheme)] ?? '').trim()
}

export function initialDraft(
  tokens: readonly EditableToken[],
  restored?: Draft | undefined,
): Draft {
  const draft: Draft = {}
  for (const token of tokens) {
    for (const scheme of schemesFor(token)) {
      const field = fieldName(token.name, scheme)
      draft[field] = restored?.[field] ?? savedValue(token, scheme)
    }
  }
  return draft
}

export function shippedValues(
  tokens: readonly EditableToken[],
  scheme: Scheme,
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const token of tokens) values[token.name] = shippedValue(token, scheme)
  return values
}

export function savedValues(
  tokens: readonly EditableToken[],
  scheme: Scheme,
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const token of tokens) {
    const field: FieldScheme = token.kind === 'colour' ? scheme : 'both'
    const saved = savedValue(token, field)
    values[token.name] = saved === '' ? shippedValue(token, scheme) : saved
  }
  return values
}

export function effectiveValues(
  tokens: readonly EditableToken[],
  draft: Draft,
  scheme: Scheme,
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const token of tokens) {
    const field: FieldScheme = token.kind === 'colour' ? scheme : 'both'
    const override = draftValue(draft, token, field)
    values[token.name] = override === '' ? shippedValue(token, scheme) : override
  }
  return values
}

export function cssVariables(values: Readonly<Record<string, string>>): Record<string, string> {
  const style: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) style[`--${name}`] = value
  return style
}

export type ChangeState = 'saved' | 'added' | 'edited' | 'cleared'

export interface TokenChange {
  readonly token: EditableToken
  readonly scheme: FieldScheme
  readonly shipped: string
  readonly saved: string
  readonly draft: string
  readonly state: ChangeState
  readonly next: string
  readonly current: string
}

function stateOf(saved: string, draft: string): ChangeState | null {
  if (draft === '' && saved === '') return null
  if (draft === saved) return 'saved'
  if (draft === '') return 'cleared'
  return saved === '' ? 'added' : 'edited'
}

export function tokenChanges(
  tokens: readonly EditableToken[],
  draft: Draft,
): readonly TokenChange[] {
  const changes: TokenChange[] = []

  for (const token of tokens) {
    for (const scheme of schemesFor(token)) {
      const saved = savedValue(token, scheme)
      const value = draftValue(draft, token, scheme)
      const state = stateOf(saved, value)
      if (state === null) continue

      const shipped = shippedValue(token, scheme)
      changes.push({
        token,
        scheme,
        shipped,
        saved,
        draft: value,
        state,
        next: value === '' ? shipped : value,
        current: saved === '' ? shipped : saved,
      })
    }
  }

  return changes
}

export interface ChangeCounts {
  readonly overridden: number
  readonly unsaved: number
  readonly tokens: number
}

export function changeCounts(changes: readonly TokenChange[]): ChangeCounts {
  return {
    overridden: changes.filter((change) => change.draft !== '').length,
    unsaved: changes.filter((change) => change.state !== 'saved').length,
    tokens: new Set(changes.filter((change) => change.draft !== '').map((c) => c.token.name)).size,
  }
}

export function matchesQuery(token: EditableToken, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true

  return [token.name, token.label, token.hint].some((field) => field.toLowerCase().includes(needle))
}
