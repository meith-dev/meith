import { ValidationError } from '@meith/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { ProfileFieldService } from './service'
import type {
  FieldType,
  ProfileFieldDefinition,
  ProfileFieldGroupRule,
  ProfileFieldRepository,
  ProfileFieldValue,
} from './types'

function definition(overrides: Partial<ProfileFieldDefinition> = {}): ProfileFieldDefinition {
  return {
    id: 1,
    key: 'pronouns',
    label: 'Pronouns',
    description: null,
    type: 'text',
    options: [],
    maxLength: null,
    displayOrder: 0,
    isActive: true,
    requiredAtRegistration: false,
    defaultVisible: true,
    defaultEditable: true,
    showInPostbit: false,
    ...overrides,
  }
}

/** An in-memory repository, so every rule below is tested without a database. */
class FakeRepository implements ProfileFieldRepository {
  fields: ProfileFieldDefinition[] = []
  rules: ProfileFieldGroupRule[] = []
  values = new Map<number, ProfileFieldValue[]>()
  saved: { userId: number; values: readonly ProfileFieldValue[] }[] = []

  async listFields() {
    return this.fields
  }
  async listGroupRules() {
    return this.rules
  }
  async valuesFor(userId: number) {
    return this.values.get(userId) ?? []
  }
  async saveValues(input: { userId: number; values: readonly ProfileFieldValue[] }) {
    this.saved.push(input)
    this.values.set(input.userId, [...input.values])
  }
  async findByKey(key: string) {
    return this.fields.find((field) => field.key === key) ?? null
  }
  async create(input: {
    key: string
    label: string
    type: FieldType
    options: readonly string[]
    requiredAtRegistration: boolean
    showInPostbit: boolean
    displayOrder: number
  }) {
    const created = definition({ ...input, id: this.fields.length + 1 })
    this.fields.push(created)
    return created
  }
  async remove(key: string) {
    const before = this.fields.length
    this.fields = this.fields.filter((field) => field.key !== key)
    return this.fields.length < before
  }
}

let repo: FakeRepository
let service: ProfileFieldService

beforeEach(() => {
  repo = new FakeRepository()
  service = new ProfileFieldService({ fields: repo })
})

/** No group rules: every field resolves to its own defaults. */
const OPEN = { applicable: [] as readonly ProfileFieldGroupRule[] }

describe('save', () => {
  it('writes an answer to a field the member may edit', async () => {
    repo.fields = [definition()]

    await service.save({
      userId: 5,
      submitted: new Map([['pronouns', ' they/them ']]),
      context: OPEN,
    })

    expect(repo.saved).toEqual([{ userId: 5, values: [{ fieldId: 1, value: 'they/them' }] }])
  })

  it('drops a submitted field the member may not edit, without saying so', async () => {
    /*
     * The refusal that matters: an error naming the field would confirm a
     * staff-only field exists. Kills the mutant that keys the write off
     * `submitted` instead of off the resolved-editable set.
     */
    repo.fields = [definition({ key: 'staff_note', defaultEditable: false })]

    await service.save({
      userId: 5,
      submitted: new Map([['staff_note', 'promoted by me']]),
      context: OPEN,
    })

    expect(repo.saved).toEqual([])
  })

  it('leaves a field the form never offered alone', async () => {
    /*
     * A partial form must not wipe what it did not render. Kills the mutant
     * that turns an absent key into an empty string.
     */
    repo.fields = [definition({ id: 1, key: 'pronouns' }), definition({ id: 2, key: 'location' })]

    await service.save({
      userId: 5,
      submitted: new Map([['pronouns', 'they/them']]),
      context: OPEN,
    })

    expect(repo.saved[0]?.values).toEqual([{ fieldId: 1, value: 'they/them' }])
  })

  it('passes an emptied field through as "", so the repository deletes the row', async () => {
    repo.fields = [definition()]

    await service.save({ userId: 5, submitted: new Map([['pronouns', '  ']]), context: OPEN })

    expect(repo.saved[0]?.values).toEqual([{ fieldId: 1, value: '' }])
  })

  it('writes nothing at all when no submitted field resolved', async () => {
    repo.fields = [definition()]
    await service.save({ userId: 5, submitted: new Map(), context: OPEN })
    expect(repo.saved).toEqual([])
  })
})

describe('validation', () => {
  async function saveValue(field: Partial<ProfileFieldDefinition>, raw: string) {
    repo.fields = [definition(field)]
    await service.save({
      userId: 5,
      submitted: new Map([[repo.fields[0]!.key, raw]]),
      context: OPEN,
    })
    return repo.saved[0]?.values[0]?.value
  }

  it('refuses a select value outside the configured options', async () => {
    await expect(
      saveValue({ type: 'select', options: ['red', 'blue'] }, 'green'),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('accepts a select value that is one of them', async () => {
    expect(await saveValue({ type: 'select', options: ['red', 'blue'] }, 'blue')).toBe('blue')
  })

  it('stores a present checkbox as "yes" whatever the browser posted', async () => {
    expect(await saveValue({ type: 'checkbox' }, 'on')).toBe('yes')
  })

  it('refuses a number that is not one', async () => {
    await expect(saveValue({ type: 'number' }, '12 monkeys')).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(await saveValue({ type: 'number' }, '-3.5')).toBe('-3.5')
  })

  it('refuses a javascript: URL', async () => {
    /*
     * A profile field rendered as a link is an attacker-controlled href. This
     * is the oldest stored-XSS vector there is, and it must fail closed.
     */
    await expect(
      saveValue({ type: 'url' }, 'javascript:alert(document.cookie)'),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('gives a bare hostname https:// rather than refusing it', async () => {
    expect(await saveValue({ type: 'url' }, 'example.com')).toBe('https://example.com/')
  })

  it('enforces the length limit', async () => {
    await expect(saveValue({ maxLength: 4 }, 'far too long')).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('validates an unknown type as text rather than refusing every save', async () => {
    /* A field written by a deploy that knew a type this build does not. */
    expect(await saveValue({ type: null }, 'anything at all')).toBe('anything at all')
  })
})

describe('registration', () => {
  it('asks only for fields marked required at registration', async () => {
    repo.fields = [
      definition({ id: 1, key: 'pronouns', requiredAtRegistration: false }),
      definition({ id: 2, key: 'referrer', requiredAtRegistration: true }),
    ]

    const required = await service.requiredAtRegistration(OPEN)
    expect(required.map((field) => field.key)).toEqual(['referrer'])
  })

  it('does not ask for a required field the group may not edit', async () => {
    repo.fields = [
      definition({ id: 1, key: 'referrer', requiredAtRegistration: true, defaultEditable: false }),
    ]
    expect(await service.requiredAtRegistration(OPEN)).toEqual([])
  })

  it('refuses a registration that left a required field blank', async () => {
    repo.fields = [definition({ id: 1, key: 'referrer', requiredAtRegistration: true })]

    await expect(
      service.validateRegistration({ submitted: new Map([['referrer', '   ']]), context: OPEN }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('returns the values to write, validated, without touching the repository', async () => {
    /*
     * The split that lets the caller refuse a registration before it creates an
     * account: validation must not write.
     */
    repo.fields = [
      definition({
        id: 1,
        key: 'referrer',
        type: 'select',
        options: ['a friend', 'a search engine'],
        requiredAtRegistration: true,
      }),
    ]

    const values = await service.validateRegistration({
      submitted: new Map([['referrer', 'a friend']]),
      context: OPEN,
    })

    expect(values).toEqual([{ fieldId: 1, value: 'a friend' }])
    expect(repo.saved).toEqual([])
  })

  it('writes them once the account exists', async () => {
    await service.applyRegistration(9, [{ fieldId: 1, value: 'a friend' }])
    expect(repo.saved).toEqual([{ userId: 9, values: [{ fieldId: 1, value: 'a friend' }] }])
  })

  it('writes nothing when the board asks for nothing', async () => {
    await service.applyRegistration(9, [])
    expect(repo.saved).toEqual([])
  })
})

describe('create', () => {
  it('lowercases and validates the key', async () => {
    const field = await service.create({
      key: '  Pronouns  ',
      label: 'Pronouns',
      type: 'text',
      options: [],
    })
    expect(field.key).toBe('pronouns')
  })

  it('refuses a key a form name or shell argument would mangle', async () => {
    for (const key of ['a', '1abc', 'has space', 'has:colon', 'x'.repeat(41)]) {
      await expect(
        service.create({ key, label: 'Label', type: 'text', options: [] }),
      ).rejects.toBeInstanceOf(ValidationError)
    }
  })

  it('refuses a type it does not know', async () => {
    await expect(
      service.create({ key: 'colour', label: 'Colour', type: 'rainbow', options: [] }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a dropdown with no options', async () => {
    await expect(
      service.create({ key: 'colour', label: 'Colour', type: 'select', options: [] }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a duplicate key', async () => {
    await service.create({ key: 'pronouns', label: 'Pronouns', type: 'text', options: [] })
    await expect(
      service.create({ key: 'PRONOUNS', label: 'Again', type: 'text', options: [] }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a blank label', async () => {
    await expect(
      service.create({ key: 'pronouns', label: '   ', type: 'text', options: [] }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('remove', () => {
  it('folds the key the way create did, so an operator can type either case', async () => {
    await service.create({ key: 'pronouns', label: 'Pronouns', type: 'text', options: [] })
    expect(await service.remove(' PRONOUNS ')).toBe(true)
  })

  it('reports a key that was not there', async () => {
    expect(await service.remove('nope')).toBe(false)
  })
})
