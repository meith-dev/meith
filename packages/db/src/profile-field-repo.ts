import { sql } from 'drizzle-orm'

import {
  parseFieldType,
  type ProfileFieldDefinition,
  type ProfileFieldGroupRule,
  type ProfileFieldRepository,
  type ProfileFieldValue,
  type FieldType,
} from '@meith/profile-fields'

import type { Database } from './client'
import { resultRows } from './result-rows'

interface RawField {
  id: number
  key: string
  label: string
  description: string | null
  type: string
  options: unknown
  max_length: number | null
  display_order: number
  is_active: boolean
  required_at_registration: boolean
  default_visible: boolean
  default_editable: boolean
  show_in_postbit: boolean
}

function toOptions(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function toField(row: RawField): ProfileFieldDefinition {
  return {
    id: Number(row.id),
    key: row.key,
    label: row.label,
    description: row.description,
    type: parseFieldType(row.type),
    options: toOptions(row.options),
    maxLength: row.max_length === null ? null : Number(row.max_length),
    displayOrder: Number(row.display_order),
    isActive: row.is_active === true,
    requiredAtRegistration: row.required_at_registration === true,
    defaultVisible: row.default_visible === true,
    defaultEditable: row.default_editable === true,
    showInPostbit: row.show_in_postbit === true,
  }
}

const SELECT_FIELD = sql`
  select id, key, label, description, type, options, max_length, display_order,
         is_active, required_at_registration, default_visible, default_editable,
         show_in_postbit
    from profile_fields
`

export class PostgresProfileFieldRepository implements ProfileFieldRepository {
  constructor(private readonly db: Database) {}

  async listFields(): Promise<readonly ProfileFieldDefinition[]> {
    const rows = resultRows(
      await this.db.execute(sql`${SELECT_FIELD} order by display_order, id`),
    ) as RawField[]

    return rows.map(toField)
  }

  async listGroupRules(): Promise<readonly ProfileFieldGroupRule[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select field_id, group_id, can_view, can_edit from profile_field_groups
      `),
    ) as Array<{
      field_id: number
      group_id: number
      can_view: boolean | null
      can_edit: boolean | null
    }>

    return rows.map((row) => ({
      fieldId: Number(row.field_id),
      groupId: Number(row.group_id),
      canView: row.can_view,
      canEdit: row.can_edit,
    }))
  }

  async valuesFor(userId: number): Promise<readonly ProfileFieldValue[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select field_id, value from profile_field_values where user_id = ${userId}
      `),
    ) as Array<{ field_id: number; value: string }>

    return rows.map((row) => ({ fieldId: Number(row.field_id), value: row.value }))
  }

  async saveValues(input: {
    readonly userId: number
    readonly values: readonly ProfileFieldValue[]
  }): Promise<void> {
    if (input.values.length === 0) return

    await this.db.transaction(async (tx) => {
      const cleared = input.values.filter((value) => value.value === '')
      const written = input.values.filter((value) => value.value !== '')

      if (cleared.length > 0) {
        await tx.execute(sql`
          delete from profile_field_values
           where user_id = ${input.userId}
             and field_id in (${sql.join(
               cleared.map((value) => sql`${value.fieldId}`),
               sql`, `,
             )})
        `)
      }

      if (written.length > 0) {
        await tx.execute(sql`
          insert into profile_field_values (user_id, field_id, value, updated_at)
          values ${sql.join(
            written.map(
              (value) => sql`(${input.userId}, ${value.fieldId}, ${value.value}, now())`,
            ),
            sql`, `,
          )}
              on conflict (user_id, field_id)
              do update set value = excluded.value, updated_at = now()
        `)
      }
    })
  }

  async findByKey(key: string): Promise<ProfileFieldDefinition | null> {
    const rows = resultRows(
      await this.db.execute(sql`${SELECT_FIELD} where key = ${key}`),
    ) as RawField[]

    return rows[0] === undefined ? null : toField(rows[0])
  }

  async create(input: {
    readonly key: string
    readonly label: string
    readonly type: FieldType
    readonly options: readonly string[]
    readonly requiredAtRegistration: boolean
    readonly showInPostbit: boolean
    readonly displayOrder: number
  }): Promise<ProfileFieldDefinition> {
    const rows = resultRows(
      await this.db.execute(sql`
        insert into profile_fields
               (key, label, type, options, required_at_registration,
                show_in_postbit, display_order)
        values (${input.key}, ${input.label}, ${input.type},
                ${JSON.stringify(input.options)}::jsonb,
                ${input.requiredAtRegistration}, ${input.showInPostbit},
                ${input.displayOrder})
        returning id, key, label, description, type, options, max_length,
                  display_order, is_active, required_at_registration,
                  default_visible, default_editable, show_in_postbit
      `),
    ) as RawField[]

    if (rows[0] === undefined) throw new Error('Profile field insert returned no row')
    return toField(rows[0])
  }

  async remove(key: string): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
        delete from profile_fields where key = ${key} returning id
      `),
    ) as Array<{ id: number }>

    return rows.length > 0
  }
}
