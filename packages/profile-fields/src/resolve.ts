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

function combine(answers: readonly (boolean | null)[], fallback: boolean): boolean {
  const stated = answers.filter((answer): answer is boolean => answer !== null)
  if (stated.length === 0) return fallback
  return stated.some((answer) => answer)
}

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

export function maxLengthFor(field: ProfileFieldDefinition): number {
  if (field.maxLength !== null && field.maxLength > 0) return field.maxLength
  return field.type === null ? DEFAULT_MAX_LENGTH.text : DEFAULT_MAX_LENGTH[field.type]
}
