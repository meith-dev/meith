/**
 * F59 — who may see and edit each field.
 *
 * Pure functions over already-fetched rows, for the reason every resolution on
 * this board is: the decision is testable without a database, and the *inputs*
 * are fetched once rather than per field.
 *
 * ## The rule is R4.2's, not a new one
 *
 * A field's per-group rows are filtered to the ones that apply to this actor —
 * by `Authorizer.applicableGroupRows`, which is the only thing allowed to know
 * what groups somebody is in (F20) — and then combined by OR: **any group
 * granting is a grant**, and a NULL is not an opinion.
 *
 * That last part is what makes a single row useful. "Staff may edit this" is
 * one row saying `canEdit: true` for the staff group, not a row per group with
 * `false` copied into every other one.
 *
 * ## Why viewing and editing are separate answers
 *
 * They are genuinely independent. A board can show a member's "joined because"
 * to everyone while letting only staff write it, and a board can let a member
 * fill in something only staff can read. Collapsing them into one visibility
 * word would make both of those unexpressible.
 */
import {
  DEFAULT_MAX_LENGTH,
  type ProfileFieldDefinition,
  type ProfileFieldGroupRule,
  type ResolvedProfileField,
} from './types'

export interface FieldAccess {
  readonly canView: boolean
  readonly canEdit: boolean
}

/**
 * Combine a field's default with the rules that apply to this actor.
 *
 * `applicable` must already be filtered to the actor's groups. Handing this
 * function every rule on the board would silently grant everybody everything,
 * which is why it takes the filtered list rather than the actor.
 */
export function resolveAccess(
  field: ProfileFieldDefinition,
  applicable: readonly ProfileFieldGroupRule[],
): FieldAccess {
  const mine = applicable.filter((rule) => rule.fieldId === field.id)

  return {
    canView: combine(
      mine.map((rule) => rule.canView),
      field.defaultVisible,
    ),
    canEdit: combine(
      mine.map((rule) => rule.canEdit),
      field.defaultEditable,
    ),
  }
}

/**
 * R4.2 for one boolean: any explicit `true` wins, an explicit `false` denies,
 * and NULL abstains.
 *
 * The order matters and is the whole rule: a member in two groups where one
 * grants and one denies is **granted**, because that is how every other
 * boolean on this board combines (`combinePermissionSets`). Doing it the other
 * way would make adding somebody to a group able to take access away, which is
 * the surprise F20's combination semantics exist to prevent.
 */
function combine(answers: readonly (boolean | null)[], fallback: boolean): boolean {
  const stated = answers.filter((answer): answer is boolean => answer !== null)
  if (stated.length === 0) return fallback
  return stated.some((answer) => answer)
}

/**
 * The fields a viewer may see, with their values.
 *
 * Inactive fields are dropped here rather than in SQL, because "inactive" is a
 * property of the *field* and every caller wants the same answer — and because
 * the list is configuration-sized, so filtering it in memory costs nothing and
 * keeps one definition of "which fields exist".
 *
 * A field with no value is **omitted entirely**, not rendered empty. F33's
 * rule: an invisible field is absent from the HTML, not hidden with CSS — and
 * an empty row on a profile is noise that makes a filled-in one harder to see.
 */
export function visibleFields(input: {
  readonly fields: readonly ProfileFieldDefinition[]
  readonly applicable: readonly ProfileFieldGroupRule[]
  readonly values: ReadonlyMap<number, string>
}): readonly ResolvedProfileField[] {
  return input.fields
    .filter((field) => field.isActive)
    .map((field) => ({
      field,
      value: input.values.get(field.id) ?? '',
      ...resolveAccess(field, input.applicable),
    }))
    .filter((resolved) => resolved.canView && resolved.value !== '')
}

/**
 * The fields a member may fill in, whether or not they have.
 *
 * Unlike `visibleFields` this keeps empty ones — an unanswered field is exactly
 * what a member came to the form to answer — and it does *not* require
 * `canView`: a board may collect something only staff read, and a member who
 * cannot see their own answer can still be asked for it.
 */
export function editableFields(input: {
  readonly fields: readonly ProfileFieldDefinition[]
  readonly applicable: readonly ProfileFieldGroupRule[]
  readonly values: ReadonlyMap<number, string>
}): readonly ResolvedProfileField[] {
  return input.fields
    .filter((field) => field.isActive)
    .map((field) => ({
      field,
      value: input.values.get(field.id) ?? '',
      ...resolveAccess(field, input.applicable),
    }))
    .filter((resolved) => resolved.canEdit)
}

/** The effective length limit: the field's, or its type's default. */
export function maxLengthFor(field: ProfileFieldDefinition): number {
  if (field.maxLength !== null && field.maxLength > 0) return field.maxLength
  return field.type === null ? DEFAULT_MAX_LENGTH.text : DEFAULT_MAX_LENGTH[field.type]
}
