import { ValidationError } from '@meith/core'
import { getDb, PostgresProfileFieldRepository } from '@meith/db'
import { FIELD_TYPES, ProfileFieldService } from '@meith/profile-fields'

import { type Flags, optional, parseFlags, required } from './args'
import { requirePostgres } from './context'

function service(): ProfileFieldService {
  requirePostgres()
  return new ProfileFieldService({ fields: new PostgresProfileFieldRepository(getDb()) })
}

function flag(flags: Flags, name: string): boolean {
  const raw = optional(flags, name)
  if (raw === undefined) return false
  const value = raw.toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(value)) return true
  if (['0', 'false', 'no', 'off'].includes(value)) return false
  throw new ValidationError(`--${name} must be true or false, got "${raw}".`)
}

export async function profileFieldList(): Promise<number> {
  const fields = await service().listAll()

  if (fields.length === 0) {
    console.log(
      'No custom profile fields.\n' +
        'Add one:  meith profile-field:add --key pronouns --label Pronouns --type text',
    )
    return 0
  }

  const width = Math.max(...fields.map((f) => f.key.length))
  console.log(`${fields.length} custom profile field(s):\n`)

  for (const field of fields) {
    const marks = [
      field.isActive ? null : 'inactive',
      field.requiredAtRegistration ? 'required at registration' : null,
      field.showInPostbit ? 'shown in postbit' : null,
      field.defaultVisible ? null : 'hidden by default',
      field.defaultEditable ? null : 'not member-editable',
    ].filter((mark): mark is string => mark !== null)

    console.log(
      `  ${field.key.padEnd(width)}  ${field.type ?? 'unknown type'}` +
        `  "${field.label}"` +
        (marks.length === 0 ? '' : `  [${marks.join(', ')}]`),
    )
    if (field.options.length > 0) {
      console.log(`  ${' '.repeat(width)}  options: ${field.options.join(', ')}`)
    }
  }
  return 0
}

export async function profileFieldAdd(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)

  const type = required(flags, 'type')
  if (!(FIELD_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError(`--type must be one of ${FIELD_TYPES.join(', ')}, got "${type}".`)
  }

  const rawOptions = optional(flags, 'options')
  const options =
    rawOptions === undefined
      ? []
      : rawOptions
          .split(',')
          .map((option) => option.trim())
          .filter((option) => option !== '')

  const field = await service().create({
    key: required(flags, 'key'),
    label: required(flags, 'label'),
    type,
    options,
    requiredAtRegistration: flag(flags, 'required'),
    showInPostbit: flag(flags, 'postbit'),
    displayOrder: Number(optional(flags, 'order') ?? 0),
  })

  console.log(`Created profile field "${field.key}" (id ${field.id}, ${field.type}).`)
  console.log('Every group can see and edit it. Per-group overrides arrive with the ACP screen.')
  return 0
}

export async function profileFieldRemove(args: readonly string[]): Promise<number> {
  const { positional } = parseFlags(args)
  const key = positional[0]
  if (key === undefined) {
    throw new ValidationError('Usage: meith profile-field:remove <key>')
  }

  const removed = await service().remove(key)
  if (!removed) {
    console.error(`No such profile field: ${key}`)
    return 1
  }

  console.log(
    `Removed profile field "${key}" and every member's answer to it.\n` +
      'To keep the answers and only stop showing the field, set profile_fields.is_active = false instead.',
  )
  return 0
}
