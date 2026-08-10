import { ValidationError } from '@meith/core'

import { editableFields, maxLengthFor, visibleFields } from './resolve'
import type {
  ProfileFieldDefinition,
  ProfileFieldGroupRule,
  ProfileFieldRepository,
  ProfileFieldValue,
  ResolvedProfileField,
} from './types'

export interface ProfileFieldContext {
  readonly applicable: readonly ProfileFieldGroupRule[]
}

export class ProfileFieldService {
  private readonly repository: ProfileFieldRepository

  constructor(deps: { fields: ProfileFieldRepository }) {
    this.repository = deps.fields
  }

  async listAll(): Promise<readonly ProfileFieldDefinition[]> {
    return this.repository.listFields()
  }

  async listGroupRules(): Promise<readonly ProfileFieldGroupRule[]> {
    return this.repository.listGroupRules()
  }

  async visibleFor(
    userId: number,
    context: ProfileFieldContext,
  ): Promise<readonly ResolvedProfileField[]> {
    const [fields, values] = await Promise.all([
      this.repository.listFields(),
      this.repository.valuesFor(userId),
    ])

    return visibleFields({
      fields,
      applicable: context.applicable,
      values: byField(values),
    })
  }

  async editableFor(
    userId: number,
    context: ProfileFieldContext,
  ): Promise<readonly ResolvedProfileField[]> {
    const [fields, values] = await Promise.all([
      this.repository.listFields(),
      this.repository.valuesFor(userId),
    ])

    return editableFields({
      fields,
      applicable: context.applicable,
      values: byField(values),
    })
  }

  async requiredAtRegistration(
    context: ProfileFieldContext,
  ): Promise<readonly ProfileFieldDefinition[]> {
    const fields = await this.repository.listFields()

    return editableFields({
      fields,
      applicable: context.applicable,
      values: new Map(),
    })
      .filter((resolved) => resolved.field.requiredAtRegistration)
      .map((resolved) => resolved.field)
  }

  async save(input: {
    readonly userId: number
    readonly submitted: ReadonlyMap<string, string>
    readonly context: ProfileFieldContext
  }): Promise<void> {
    const editable = await this.editableFor(input.userId, input.context)

    const values: ProfileFieldValue[] = []
    for (const resolved of editable) {
      const raw = input.submitted.get(resolved.field.key)
      if (raw === undefined) continue
      values.push({ fieldId: resolved.field.id, value: validate(resolved.field, raw) })
    }

    if (values.length > 0) {
      await this.repository.saveValues({ userId: input.userId, values })
    }
  }

  async validateRegistration(input: {
    readonly submitted: ReadonlyMap<string, string>
    readonly context: ProfileFieldContext
  }): Promise<readonly ProfileFieldValue[]> {
    const required = await this.requiredAtRegistration(input.context)

    return required.map((field) => {
      const raw = (input.submitted.get(field.key) ?? '').trim()
      if (raw === '') throw new ValidationError(`${field.label} is required.`)
      return { fieldId: field.id, value: validate(field, raw) }
    })
  }

  async applyRegistration(
    userId: number,
    values: readonly ProfileFieldValue[],
  ): Promise<void> {
    if (values.length === 0) return
    await this.repository.saveValues({ userId, values })
  }

  async create(input: {
    readonly key: string
    readonly label: string
    readonly type: string
    readonly options: readonly string[]
    readonly requiredAtRegistration?: boolean
    readonly showInPostbit?: boolean
    readonly displayOrder?: number
  }): Promise<ProfileFieldDefinition> {
    const key = input.key.trim().toLowerCase()
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) {
      throw new ValidationError(
        'A field key must be 2–40 characters: a letter, then letters, digits or underscores.',
      )
    }

    const label = input.label.trim()
    if (label === '') throw new ValidationError('A field needs a label.')

    const type = parseType(input.type)
    if (type === 'select' && input.options.length === 0) {
      throw new ValidationError('A dropdown needs at least one option.')
    }

    if (await this.repository.findByKey(key)) {
      throw new ValidationError(`A field with the key "${key}" already exists.`)
    }

    return this.repository.create({
      key,
      label,
      type,
      options: input.options,
      requiredAtRegistration: input.requiredAtRegistration ?? false,
      showInPostbit: input.showInPostbit ?? false,
      displayOrder: input.displayOrder ?? 0,
    })
  }

  async remove(key: string): Promise<boolean> {
    return this.repository.remove(key.trim().toLowerCase())
  }
}

function byField(values: readonly ProfileFieldValue[]): ReadonlyMap<number, string> {
  return new Map(values.map((value) => [value.fieldId, value.value]))
}

function parseType(value: string): ProfileFieldDefinition['type'] & string {
  const type = value.trim().toLowerCase()
  if (
    type === 'text' ||
    type === 'textarea' ||
    type === 'select' ||
    type === 'checkbox' ||
    type === 'url' ||
    type === 'number'
  ) {
    return type
  }
  throw new ValidationError(`"${value}" is not a field type.`)
}

function validate(field: ProfileFieldDefinition, raw: string): string {
  const value = raw.trim()
  if (value === '') return ''

  const limit = maxLengthFor(field)
  if (value.length > limit) {
    throw new ValidationError(`${field.label} may be at most ${limit} characters.`)
  }

  switch (field.type) {
    case 'select':
      if (!field.options.includes(value)) {
        throw new ValidationError(`${field.label} must be one of the offered choices.`)
      }
      return value

    case 'checkbox':
      return 'yes'

    case 'number':
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        throw new ValidationError(`${field.label} must be a number.`)
      }
      return value

    case 'url':
      return normaliseUrl(field, value)

    default:
      return value
  }
}

function normaliseUrl(field: ProfileFieldDefinition, value: string): string {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new ValidationError(`${field.label} must be a web address.`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(`${field.label} must start with http:// or https://.`)
  }
  return url.toString()
}
