export const FIELD_TYPES = [
  'text',
  'textarea',
  'select',
  'checkbox',
  'url',
  'number',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export function parseFieldType(value: string): FieldType | null {
  return FIELD_TYPES.includes(value as FieldType) ? (value as FieldType) : null
}

export const DEFAULT_MAX_LENGTH: Readonly<Record<FieldType, number>> = {
  text: 200,
  textarea: 2000,
  select: 100,
  checkbox: 5,
  url: 300,
  number: 20,
}

export interface ProfileFieldDefinition {
  readonly id: number
  readonly key: string
  readonly label: string
  readonly description: string | null
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

export interface ProfileFieldGroupRule {
  readonly fieldId: number
  readonly groupId: number
  readonly canView: boolean | null
  readonly canEdit: boolean | null
}

export interface ProfileFieldValue {
  readonly fieldId: number
  readonly value: string
}

export interface ResolvedProfileField {
  readonly field: ProfileFieldDefinition
  readonly value: string
  readonly canView: boolean
  readonly canEdit: boolean
}

export interface ProfileFieldRepository {
  listFields(): Promise<readonly ProfileFieldDefinition[]>

  listGroupRules(): Promise<readonly ProfileFieldGroupRule[]>

  valuesFor(userId: number): Promise<readonly ProfileFieldValue[]>

  saveValues(input: {
    readonly userId: number
    readonly values: readonly ProfileFieldValue[]
  }): Promise<void>

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

  remove(key: string): Promise<boolean>
}
