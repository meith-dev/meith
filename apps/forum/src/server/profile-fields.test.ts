/**
 * F59 at the app layer.
 *
 * The resolution rules are unit-tested in `@forum/profile-fields` and the SQL
 * against real Postgres. What is proven here is the seam neither can see:
 *
 *  - the viewer's rules come from `Authorizer.applicableGroupRows`, so a field
 *    restricted to a group is invisible to somebody outside it — the one thing
 *    that would leak member data if the wiring were wrong;
 *  - the *registration* context is the default member group's, not the guest's,
 *    because an applicant has no groups yet;
 *  - a broken field configuration degrades to no fields rather than taking out
 *    the profile page;
 *  - a submitted `field:` name the member may not edit writes nothing, through
 *    the real Server Action.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InMemoryAuthorizationSource, combinePermissionSets } from '@forum/authorization'
import type { Actor } from '@forum/authorization'
import type {
  FieldType,
  ProfileFieldDefinition,
  ProfileFieldGroupRule,
  ProfileFieldRepository,
  ProfileFieldValue,
} from '@forum/profile-fields'
import type { MemberSettings, MemberSettingsRepository } from '@forum/accounts'

const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(readonly location: string) {
      super(`redirect: ${location}`)
    }
  }
  return { RedirectError }
})

vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new RedirectError(to)
  },
}))

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({ getActor: async () => actorRef.current }))

vi.mock('./usercp-mail', () => ({ sendEmailChangeConfirmation: async () => {} }))
vi.mock('./session-cookies', () => ({ setSessionCookie: async () => {} }))

const {
  postbitProfileFields,
  registrationFields,
  visibleProfileFields,
} = await import('./profile-fields')
const { saveProfileAction } = await import('./usercp-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const OWNER = 7

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

class FakeFields implements ProfileFieldRepository {
  fields: ProfileFieldDefinition[] = []
  rules: ProfileFieldGroupRule[] = []
  values = new Map<number, ProfileFieldValue[]>()
  saved: { userId: number; values: readonly ProfileFieldValue[] }[] = []
  /** Set to make `listFields` throw, standing in for broken configuration. */
  breaks = false

  async listFields() {
    if (this.breaks) throw new Error('profile_fields is unreadable')
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
  }
  async findByKey(key: string) {
    return this.fields.find((field) => field.key === key) ?? null
  }
  async create(input: { key: string; label: string; type: FieldType }) {
    const created = definition({ ...input, id: this.fields.length + 1 })
    this.fields.push(created)
    return created
  }
  async remove() {
    return false
  }
}

/** F57's store, needed only because the profile action saves both halves. */
class FakeSettings implements MemberSettingsRepository {
  row: MemberSettings = {
    userId: OWNER,
    email: 'ivan@example.test',
    timezone: 'UTC',
    postsPerPage: null,
    threadsPerPage: null,
    invisible: false,
    location: null,
    website: null,
    bio: null,
  }
  async read() {
    return this.row
  }
  async saveProfile() {}
  async saveOptions() {}
  async adoptEmail() {
    return true
  }
}

let fields: FakeFields

async function actorFor(groupId: number, userId: number | null): Promise<Actor> {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  const defaults = await source.groupDefaults([groupId])
  return {
    userId,
    groupIds: [groupId],
    primaryGroupId: groupId,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(defaults.map((d) => d.permissions)),
    permissionVersion: 1,
  }
}

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

beforeEach(async () => {
  fields = new FakeFields()
  actorRef.current = await actorFor(SEED_GROUP.registered, OWNER)
  installTestContainer({
    container: { profileFields: fields, memberSettings: new FakeSettings() },
  })
})

describe('what a viewer sees on a profile', () => {
  it('shows an answered field the viewer may see', async () => {
    fields.fields = [definition()]
    fields.values.set(OWNER, [{ fieldId: 1, value: 'they/them' }])

    expect(await visibleProfileFields(OWNER)).toEqual([
      { label: 'Pronouns', value: 'they/them' },
    ])
  })

  it('hides a field restricted to a group the viewer is not in', async () => {
    /*
     * The leak this whole seam exists to prevent. `defaultVisible: false` plus
     * one grant for the moderator group means a registered member gets nothing
     * — and the narrowing that decides so is the Authorizer's, not this file's.
     */
    fields.fields = [definition({ key: 'staff_note', label: 'Staff note', defaultVisible: false })]
    fields.rules = [{ fieldId: 1, groupId: SEED_GROUP.moderators, canView: true, canEdit: null }]
    fields.values.set(OWNER, [{ fieldId: 1, value: 'watch this one' }])

    expect(await visibleProfileFields(OWNER)).toEqual([])
  })

  it('shows it to somebody who is in that group', async () => {
    fields.fields = [definition({ key: 'staff_note', label: 'Staff note', defaultVisible: false })]
    fields.rules = [{ fieldId: 1, groupId: SEED_GROUP.moderators, canView: true, canEdit: null }]
    fields.values.set(OWNER, [{ fieldId: 1, value: 'watch this one' }])
    actorRef.current = await actorFor(SEED_GROUP.moderators, 2)

    expect(await visibleProfileFields(OWNER)).toEqual([
      { label: 'Staff note', value: 'watch this one' },
    ])
  })

  it('returns nothing rather than throwing when the configuration is broken', async () => {
    fields.breaks = true
    expect(await visibleProfileFields(OWNER)).toEqual([])
  })

  it('returns nothing on a board with no field store', async () => {
    installTestContainer({ container: { profileFields: null } })
    expect(await visibleProfileFields(OWNER)).toEqual([])
  })
})

describe('the postbit', () => {
  it('shows only the fields an operator marked for it', async () => {
    fields.fields = [
      definition({ id: 1, key: 'pronouns', label: 'Pronouns', showInPostbit: true }),
      definition({ id: 2, key: 'location', label: 'Location', showInPostbit: false }),
    ]
    fields.values.set(OWNER, [
      { fieldId: 1, value: 'they/them' },
      { fieldId: 2, value: 'Riga' },
    ])

    expect(await postbitProfileFields(OWNER)).toEqual([
      { label: 'Pronouns', value: 'they/them' },
    ])
  })
})

describe('the registration form', () => {
  it("asks for a required field the default member group may edit", async () => {
    fields.fields = [
      definition({ id: 1, key: 'referrer', label: 'How did you find us?', requiredAtRegistration: true }),
      definition({ id: 2, key: 'pronouns', requiredAtRegistration: false }),
    ]
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const asked = await registrationFields()
    expect(asked.map((field) => field.key)).toEqual(['referrer'])
  })

  it("resolves against the default member group, not the guest looking at the form", async () => {
    /*
     * The mistake this test exists to catch: an applicant *is* a guest, so
     * resolving the viewer's context would ask for whatever guests may edit —
     * nothing — and the required field would silently never be asked.
     */
    fields.fields = [
      definition({ id: 1, key: 'referrer', requiredAtRegistration: true, defaultEditable: false }),
    ]
    fields.rules = [
      { fieldId: 1, groupId: SEED_GROUP.registered, canView: null, canEdit: true },
    ]
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    expect((await registrationFields()).map((field) => field.key)).toEqual(['referrer'])
  })

  it('carries the resolved length limit, so the form and the server agree', async () => {
    fields.fields = [
      definition({ id: 1, key: 'referrer', requiredAtRegistration: true, type: 'textarea' }),
    ]
    expect((await registrationFields())[0]?.maxLength).toBe(2000)
  })

  it('asks for nothing when the configuration is broken', async () => {
    fields.fields = [definition({ requiredAtRegistration: true })]
    fields.breaks = true
    expect(await registrationFields()).toEqual([])
  })
})

describe('saving from the profile form', () => {
  async function save(entries: Array<[string, string]>): Promise<string | undefined> {
    try {
      const state = await saveProfileAction(EMPTY_STATE, form(entries))
      return state.error
    } catch (err) {
      if (err instanceof RedirectError) return undefined
      throw err
    }
  }

  it('writes a prefixed field alongside F57s own three', async () => {
    fields.fields = [definition()]

    await save([
      ['location', 'Riga'],
      ['website', ''],
      ['bio', ''],
      ['field:pronouns', 'they/them'],
    ])

    expect(fields.saved).toEqual([{ userId: OWNER, values: [{ fieldId: 1, value: 'they/them' }] }])
  })

  it('ignores a submitted field the member may not edit, and does not say so', async () => {
    fields.fields = [definition({ key: 'staff_note', defaultEditable: false })]

    const error = await save([
      ['location', ''],
      ['website', ''],
      ['bio', ''],
      ['field:staff_note', 'promoted by me'],
    ])

    expect(error).toBeUndefined()
    expect(fields.saved).toEqual([])
  })

  it('does not read an unprefixed name as a field', async () => {
    /*
     * The prefix is what keeps a field keyed `website` from colliding with
     * F57's fixed input. Kills the mutant that drops it.
     */
    fields.fields = [definition({ id: 1, key: 'website' })]

    await save([
      ['location', ''],
      ['website', 'https://example.test'],
      ['bio', ''],
    ])

    expect(fields.saved).toEqual([])
  })
})
