import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresProfileFieldRepository } from './profile-field-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresProfileFieldRepository

const IVAN = 1
const MOD = 2

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresProfileFieldRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from profile_field_values`)
  await db.execute(sql`delete from profile_field_groups`)
  await db.execute(sql`delete from profile_fields`)
  await db.execute(sql`delete from users`)

  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${IVAN}, 'ivan', 'ivan', 'ivan@example.test', 'ivan@example.test',
            'x', 'argon2id', 2),
           (${MOD}, 'mod', 'mod', 'mod@example.test', 'mod@example.test',
            'x', 'argon2id', 4)
  `)
})

async function insertField(
  key: string,
  overrides: Partial<{
    type: string
    options: string
    max_length: number
    display_order: number
    is_active: boolean
    default_visible: boolean
    default_editable: boolean
    show_in_postbit: boolean
    required_at_registration: boolean
  }> = {},
): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`
      insert into profile_fields
             (key, label, type, options, max_length, display_order, is_active,
              default_visible, default_editable, show_in_postbit,
              required_at_registration)
      values (${key}, ${key}, ${overrides.type ?? 'text'},
              ${overrides.options ?? '[]'}::jsonb, ${overrides.max_length ?? null},
              ${overrides.display_order ?? 0}, ${overrides.is_active ?? true},
              ${overrides.default_visible ?? true}, ${overrides.default_editable ?? true},
              ${overrides.show_in_postbit ?? false},
              ${overrides.required_at_registration ?? false})
      returning id
    `),
  ) as Array<{ id: number }>

  return Number(rows[0]!.id)
}

describe('listFields', () => {
  it('returns every field in display order, inactive ones included', async () => {
    await insertField('second', { display_order: 2 })
    await insertField('first', { display_order: 1 })
    await insertField('off', { display_order: 3, is_active: false })

    const fields = await repo.listFields()
    expect(fields.map((field) => field.key)).toEqual(['first', 'second', 'off'])
    expect(fields[2]?.isActive).toBe(false)
  })

  it('parses the option list and leaves a broken one empty rather than throwing', async () => {
    await insertField('good', { type: 'select', options: '["red","blue"]', display_order: 1 })
    await insertField('bad', { type: 'select', options: '{"red":true}', display_order: 2 })

    const fields = await repo.listFields()
    expect(fields[0]?.options).toEqual(['red', 'blue'])
    expect(fields[1]?.options).toEqual([])
  })

  it('reports a type this build does not know as null', async () => {
    await insertField('exotic', { type: 'colourpicker' })
    const [field] = await repo.listFields()
    expect(field?.type).toBeNull()
  })
})

describe('listGroupRules', () => {
  it('returns every rule with NULL preserved as null, not as false', async () => {
    const id = await insertField('staff_note')
    await db.execute(sql`
      insert into profile_field_groups (field_id, group_id, can_view, can_edit)
      values (${id}, 4, true, null)
    `)

    const [rule] = await repo.listGroupRules()
    expect(rule).toEqual({ fieldId: id, groupId: 4, canView: true, canEdit: null })
  })
})

describe('saveValues', () => {
  it('writes an answer and reads it back for that member only', async () => {
    const id = await insertField('pronouns')

    await repo.saveValues({ userId: IVAN, values: [{ fieldId: id, value: 'they/them' }] })

    expect(await repo.valuesFor(IVAN)).toEqual([{ fieldId: id, value: 'they/them' }])
    expect(await repo.valuesFor(MOD)).toEqual([])
  })

  it('deletes the row when an answer is emptied, rather than storing an empty string', async () => {
    const id = await insertField('pronouns')
    await repo.saveValues({ userId: IVAN, values: [{ fieldId: id, value: 'they/them' }] })

    await repo.saveValues({ userId: IVAN, values: [{ fieldId: id, value: '' }] })

    expect(await repo.valuesFor(IVAN)).toEqual([])
    const rows = resultRows(
      await db.execute(sql`select count(*)::int as n from profile_field_values`),
    ) as Array<{ n: number }>
    expect(rows[0]?.n).toBe(0)
  })

  it('clears one field and writes another in the same call', async () => {
    const kept = await insertField('pronouns', { display_order: 1 })
    const cleared = await insertField('location', { display_order: 2 })
    await repo.saveValues({
      userId: IVAN,
      values: [
        { fieldId: kept, value: 'they/them' },
        { fieldId: cleared, value: 'Riga' },
      ],
    })

    await repo.saveValues({
      userId: IVAN,
      values: [
        { fieldId: kept, value: 'she/her' },
        { fieldId: cleared, value: '' },
      ],
    })

    expect(await repo.valuesFor(IVAN)).toEqual([{ fieldId: kept, value: 'she/her' }])
  })

  it('is idempotent: saving the same form twice leaves one row', async () => {
    const id = await insertField('pronouns')
    const values = [{ fieldId: id, value: 'they/them' }]

    await repo.saveValues({ userId: IVAN, values })
    await repo.saveValues({ userId: IVAN, values })

    expect(await repo.valuesFor(IVAN)).toEqual(values)
  })

  it('does nothing at all when handed no values', async () => {
    await repo.saveValues({ userId: IVAN, values: [] })
    expect(await repo.valuesFor(IVAN)).toEqual([])
  })
})

describe('the operator surface', () => {
  it('creates a field with its options and finds it by key', async () => {
    const created = await repo.create({
      key: 'console',
      label: 'Which console',
      type: 'select',
      options: ['PC', 'Switch'],
      requiredAtRegistration: true,
      showInPostbit: true,
      displayOrder: 3,
    })

    expect(created.options).toEqual(['PC', 'Switch'])
    expect(created.requiredAtRegistration).toBe(true)
    expect(created.showInPostbit).toBe(true)
    expect(created.displayOrder).toBe(3)

    expect((await repo.findByKey('console'))?.id).toBe(created.id)
    expect(await repo.findByKey('nope')).toBeNull()
  })

  it('refuses a duplicate key at the database, not only in the service', async () => {
    await insertField('pronouns')
    await expect(
      repo.create({
        key: 'pronouns',
        label: 'Pronouns',
        type: 'text',
        options: [],
        requiredAtRegistration: false,
        showInPostbit: false,
        displayOrder: 0,
      }),
    ).rejects.toThrow()
  })

  it("removes a field and every member's answer to it, by cascade", async () => {
    const id = await insertField('pronouns')
    await repo.saveValues({ userId: IVAN, values: [{ fieldId: id, value: 'they/them' }] })

    expect(await repo.remove('pronouns')).toBe(true)
    expect(await repo.valuesFor(IVAN)).toEqual([])
  })

  it('reports a key that was not there instead of claiming success', async () => {
    expect(await repo.remove('nope')).toBe(false)
  })
})
