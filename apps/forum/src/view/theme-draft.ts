/**
 * The theme editor's document model, as plain functions.
 *
 * ## Why this is not inside the form component
 *
 * Because it is where the screen's honesty lives, and a `.tsx` file in this
 * repository cannot be tested — vitest collects `.test.ts` and nothing in the
 * suite renders a component. The rules below are the ones that decide what an
 * operator is told and what actually reaches the database:
 *
 *  - a blank field is "use the theme's value", **not** an empty override;
 *  - a token with no light/dark distinction posts one field named `both`, and
 *    the two schemes read that one field;
 *  - what the board renders *now* is the theme's values plus the **stored**
 *    overrides, and what the sample paints is the theme's values plus the
 *    **draft** — the two are different documents, and the whole point of the
 *    change panel is to show where they differ.
 *
 * Every one of those was previously a line inside a component nobody could
 * assert on, and two of them were wrong in the version this replaces: the editor
 * could not tell an operator which of their changes were already live, and
 * clearing a stored override showed as "using the theme's value" while the board
 * was still painting the old one.
 *
 * ## Four values per token, and they are all different questions
 *
 * | | Where it comes from | What it answers |
 * |---|---|---|
 * | **shipped** | the theme package | what this theme looks like as installed |
 * | **saved** | `themes.token_overrides` | what the board is painting right now |
 * | **draft** | the form | what a save would paint |
 * | **effective** | draft ?? shipped | what the sample paints |
 *
 * A screen that collapses any two of them tells an operator something untrue.
 */

import type { TokenKind } from './theme-tokens'

/** A colour scheme the board actually renders. */
export type Scheme = 'light' | 'dark'

export const SCHEMES: readonly Scheme[] = ['light', 'dark']

/**
 * A scheme as the *form* names it.
 *
 * `both` is not a third scheme. It is how a token with no light/dark meaning —
 * corner radius, the spacing step, a font stack — submits a single value, which
 * the action expands into both schemes before storing. A single box for a value
 * that genuinely differs between schemes is a control that cannot express the
 * right answer; two boxes for a corner radius are two chances to disagree with
 * yourself.
 */
export type FieldScheme = Scheme | 'both'

/** One editable token: what the theme ships, and what this board has stored. */
export interface EditableToken {
  readonly name: string
  readonly label: string
  readonly hint: string
  readonly kind: TokenKind
  /** The compiled value, straight from the theme package. */
  readonly light: string
  readonly dark: string
  /** This board's stored override per scheme, or `''` for "use the theme's". */
  readonly overrideLight: string
  readonly overrideDark: string
}

/** Every field name the form posts, and what is in it right now. */
export type Draft = Record<string, string>

/** The name the form posts a token under. Parsed by `submittedTokens`. */
export function fieldName(name: string, scheme: FieldScheme): string {
  return `token.${scheme}.${name}`
}

/** A token that means the same thing in both schemes has one field. */
export function schemesFor(token: EditableToken): readonly FieldScheme[] {
  return token.kind === 'colour' ? ['light', 'dark'] : ['both']
}

/** The theme's own value for one of a token's fields. */
export function shippedValue(token: EditableToken, scheme: FieldScheme): string {
  return scheme === 'dark' ? token.dark : token.light
}

/** What the board has stored for one of a token's fields, or `''`. */
export function savedValue(token: EditableToken, scheme: FieldScheme): string {
  return scheme === 'dark' ? token.overrideDark : token.overrideLight
}

/** What is in the form for one of a token's fields, or `''`. */
export function draftValue(draft: Draft, token: EditableToken, scheme: FieldScheme): string {
  return (draft[fieldName(token.name, scheme)] ?? '').trim()
}

/**
 * The form's starting state: the stored overrides, or a post-back's values.
 *
 * The post-back path is the no-JavaScript preview (D06) — the action hands back
 * every `token.*` field it was given, and seeding from those is what stops a
 * preview clearing the form it was launched from.
 */
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

/**
 * One scheme's palette as the theme ships it — no board overrides at all.
 *
 * This is the "before" column of every comparison on the screen, and it is also
 * what a reset would leave behind.
 */
export function shippedValues(
  tokens: readonly EditableToken[],
  scheme: Scheme,
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const token of tokens) values[token.name] = shippedValue(token, scheme)
  return values
}

/**
 * One scheme's palette as the board is painting it **right now**.
 *
 * Stored overrides only. The legibility panel measures this alongside the draft
 * so a failure can be attributed: a board whose "Delete" button was already
 * unreadable should not have that laid at the door of the operator who has just
 * opened the screen.
 */
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

/**
 * One scheme's palette as a **save would leave it**.
 *
 * The *whole* palette, not just the overrides — the sample sits inside the
 * control panel, which is painted by `:root`, so an alternate theme previewed
 * with only its overrides declared would show the *board's* colours everywhere
 * it had not overridden one. That is precisely the mistake this screen exists to
 * stop an operator making.
 */
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

/**
 * A palette as custom properties, for a `style` prop.
 *
 * Set through React's `style` rather than a generated `<style>` block, so a
 * half-typed value is a property the browser drops rather than a string this
 * screen has to sanitise. The saved values still go through F26's validator on
 * the server; nothing here is load-bearing for safety.
 */
export function cssVariables(values: Readonly<Record<string, string>>): Record<string, string> {
  const style: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) style[`--${name}`] = value
  return style
}

/**
 * What one field is doing, relative to the board as it stands.
 *
 * Four states rather than a boolean, because "changed" answers two questions at
 * once and an operator needs them apart: *is this different from the theme?* and
 * *is this different from what the board is serving?* A screen with one flag
 * either hides the edits you have not saved among the ones you have, or forgets
 * which of your overrides are already live.
 */
export type ChangeState =
  /** Live on the board, and untouched in this session. */
  | 'saved'
  /** An override this session added, over the theme's own value. */
  | 'added'
  /** An override the board already had, given a different value here. */
  | 'edited'
  /** An override the board has, which this session has emptied. */
  | 'cleared'

export interface TokenChange {
  readonly token: EditableToken
  readonly scheme: FieldScheme
  readonly shipped: string
  readonly saved: string
  readonly draft: string
  readonly state: ChangeState
  /** What the board would paint after a save. */
  readonly next: string
  /** What the board is painting before one. */
  readonly current: string
}

function stateOf(saved: string, draft: string): ChangeState | null {
  if (draft === '' && saved === '') return null
  if (draft === saved) return 'saved'
  if (draft === '') return 'cleared'
  return saved === '' ? 'added' : 'edited'
}

/**
 * Every field that differs from the theme, or from the board, or from both.
 *
 * In the order the tokens were given, which is the theme's declaration order and
 * therefore the order the editor lists them — a change panel sorted by anything
 * else makes "find this one in the form" a search.
 */
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
  /** Fields a save would write as overrides. */
  readonly overridden: number
  /** Fields where the draft and the database disagree. */
  readonly unsaved: number
  /** Distinct tokens involved, which is what the listing screen counts. */
  readonly tokens: number
}

export function changeCounts(changes: readonly TokenChange[]): ChangeCounts {
  return {
    overridden: changes.filter((change) => change.draft !== '').length,
    unsaved: changes.filter((change) => change.state !== 'saved').length,
    tokens: new Set(changes.filter((change) => change.draft !== '').map((c) => c.token.name)).size,
  }
}

/**
 * Does this token answer the editor's filter box?
 *
 * Name, label and hint, because an operator arrives with any of the three: they
 * know the token is called `primary`, or they are looking for "button", or they
 * remember the description said "focus". Case-folded with `toLowerCase` and not
 * `toLocaleLowerCase` — this matches a query against English UI copy, and the
 * board's locale-fold rule (`@meith/accounts`) is about identity, not search.
 */
export function matchesQuery(token: EditableToken, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true

  return [token.name, token.label, token.hint].some((field) =>
    field.toLowerCase().includes(needle),
  )
}
