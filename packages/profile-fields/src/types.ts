/**
 * F59 — what a custom profile field is.
 *
 * F57 gave a member three fields the board decided on. This is the same idea
 * handed to the operator, with three things that trio did not need: a **type**,
 * a **per-group answer** to who may see and edit each one, and a way to **ask
 * at registration**.
 *
 * The per-group half is shaped exactly like F21's `community_permissions` —
 * nullable columns where NULL means "inherit the field's default", resolved by
 * R4.2's rule that any group granting is a grant. That is deliberate rather
 * than convenient: it is the model this board already resolves everywhere else,
 * so "who can see this" has one mental shape.
 */

/**
 * The types a field can be.
 *
 * Deliberately small. Every one of these renders as a native input that works
 * with scripting off, and each has an obvious plain-text storage form — which
 * is what lets `profile_field_values.value` be a single text column instead of
 * a typed one per kind.
 */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'select',
  'checkbox',
  'url',
  'number',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

/**
 * Narrow a stored type without trusting it.
 *
 * `profile_fields.type` is text, so a row written by a deploy that knew a type
 * this build has removed will arrive here. Returning `null` lets the caller
 * degrade to a plain input rather than fail the profile screen — F55's rule
 * about rows written by a previous deploy, applied to configuration.
 */
export function parseFieldType(value: string): FieldType | null {
  return FIELD_TYPES.includes(value as FieldType) ? (value as FieldType) : null
}

/** The default length limit per type, when a field sets none. */
export const DEFAULT_MAX_LENGTH: Readonly<Record<FieldType, number>> = {
  text: 200,
  textarea: 2000,
  select: 100,
  checkbox: 5,
  url: 300,
  number: 20,
}

/** A field as configured. */
export interface ProfileFieldDefinition {
  readonly id: number
  /** Stable machine name; the label may be renamed freely. */
  readonly key: string
  readonly label: string
  readonly description: string | null
  /** `null` when the stored type is one this build does not know. */
  readonly type: FieldType | null
  readonly options: readonly string[]
  readonly maxLength: number | null
  readonly displayOrder: number
  readonly isActive: boolean
  readonly requiredAtRegistration: boolean
  readonly defaultVisible: boolean
  readonly defaultEditable: boolean
  readonly showInPostbit: boolean
}

/** One per-group override row. NULL means "inherit the field's default". */
export interface ProfileFieldGroupRule {
  readonly fieldId: number
  readonly groupId: number
  readonly canView: boolean | null
  readonly canEdit: boolean | null
}

/** A member's answer. */
export interface ProfileFieldValue {
  readonly fieldId: number
  readonly value: string
}

/** A field plus what this viewer may do with it, and what it currently says. */
export interface ResolvedProfileField {
  readonly field: ProfileFieldDefinition
  readonly value: string
  readonly canView: boolean
  readonly canEdit: boolean
}

export interface ProfileFieldRepository {
  /** Every field, in display order. Inactive ones included — the caller filters. */
  listFields(): Promise<readonly ProfileFieldDefinition[]>

  /** Every per-group rule. Small enough to read whole: it is configuration. */
  listGroupRules(): Promise<readonly ProfileFieldGroupRule[]>

  valuesFor(userId: number): Promise<readonly ProfileFieldValue[]>

  /**
   * Write a member's answers.
   *
   * Takes the whole set the caller resolved as editable, so "cleared" and
   * "never answered" are one code path: an empty value deletes the row rather
   * than storing an empty string that every read then has to treat as absent.
   */
  saveValues(input: {
    readonly userId: number
    readonly values: readonly ProfileFieldValue[]
  }): Promise<void>

  /* ---- The operator surface (F13's CLI, until F71's screen) ---- */

  findByKey(key: string): Promise<ProfileFieldDefinition | null>

  create(input: {
    readonly key: string
    readonly label: string
    readonly type: FieldType
    readonly options: readonly string[]
    readonly requiredAtRegistration: boolean
    readonly showInPostbit: boolean
    readonly displayOrder: number
  }): Promise<ProfileFieldDefinition>

  /** Returns false when there was no such field. */
  remove(key: string): Promise<boolean>
}
