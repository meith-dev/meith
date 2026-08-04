/**
 * F59 — `profile-field:list|add|remove`.
 *
 * The only way to define a custom field until F71 builds the ACP screen. That
 * is not a stopgap in the apologetic sense: a field is board configuration, and
 * an operator who can create one from a terminal can also do it from a deploy
 * script, which is how a board with a dozen fields actually gets set up.
 *
 * Built over `ProfileFieldService` rather than the repository, so the CLI gets
 * the same key rules, type checking and duplicate refusal the ACP screen will —
 * the F13 header's whole argument for keeping this layer thin.
 */
import { ValidationError } from '@meith/core'
import { PostgresProfileFieldRepository, getDb } from '@meith/db'
import { FIELD_TYPES, ProfileFieldService } from '@meith/profile-fields'

import { optional, parseFlags, required, type Flags } from './args'
import { requirePostgres } from './context'

/**
 * The service, over a repository built directly on the database.
 *
 * `createContext()` is not used because none of its services are needed here
 * and every one of them costs a query on a command that may only be listing.
 */
function service(): ProfileFieldService {
  requirePostgres()
  return new ProfileFieldService({ fields: new PostgresProfileFieldRepository(getDb()) })
}

/**
 * A flag that is present without a value, or set to a truthy word.
 *
 * `parseFlags` already turns a bare `--postbit` into `"true"`, so this only has
 * to decide what an explicit `--postbit=no` means — and it refuses anything it
 * does not recognise rather than reading it as false, because a typo silently
 * meaning "off" is how a field ends up not asked for at registration.
 */
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
        'Add one:  forum profile-field:add --key pronouns --label Pronouns --type text',
    )
    return 0
  }

  const width = Math.max(...fields.map((f) => f.key.length))
  console.log(`${fields.length} custom profile field(s):\n`)

  for (const field of fields) {
    /*
     * The flags are printed as words rather than a table of booleans: an
     * operator reading this wants to know what is unusual about a field, and
     * everything unmarked is the default.
     */
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
  /*
   * Checked before the database is opened so a typo is reported as a typo, and
   * with the list attached — a message that says what is valid saves the round
   * trip to `--help`.
   */
  if (!(FIELD_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError(
      `--type must be one of ${FIELD_TYPES.join(', ')}, got "${type}".`,
    )
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
  /*
   * Said here rather than left to be discovered: a new field is visible and
   * editable by every group, because the per-group rows are overrides on top of
   * the field's own defaults (F21's shape). An operator who wanted a staff-only
   * field has not got one yet.
   */
  console.log(
    'Every group can see and edit it. Per-group overrides arrive with the ACP screen (F71).',
  )
  return 0
}

export async function profileFieldRemove(args: readonly string[]): Promise<number> {
  const { positional } = parseFlags(args)
  const key = positional[0]
  if (key === undefined) {
    throw new ValidationError('Usage: forum profile-field:remove <key>')
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
