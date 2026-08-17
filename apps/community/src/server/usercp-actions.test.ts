import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MemberSettings, MemberSettingsRepository } from '@meith/accounts'
import type { Actor } from '@meith/authorization'
import { combinePermissionSets, InMemoryAuthorizationSource } from '@meith/authorization'

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

const cookieRef: { current: Array<{ token: string }> } = { current: [] }
vi.mock('./session-cookies', () => ({
  setSessionCookie: async (token: string) => {
    cookieRef.current.push({ token })
  },
}))

const mailRef: { current: Array<{ email: string; token: string }> } = { current: [] }
vi.mock('./usercp-mail', () => ({
  sendEmailChangeConfirmation: async (input: { email: string; token: string }) => {
    mailRef.current.push(input)
  },
}))

const {
  changePasswordAction,
  requestEmailChangeAction,
  saveDisplayGroupAction,
  saveOptionsAction,
  saveProfileAction,
} = await import('./usercp-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const PASSWORD = 'correct horse battery staple'

class FakeSettings implements MemberSettingsRepository {
  row: MemberSettings = {
    userId: 7,
    email: 'ivan@example.test',
    timezone: 'UTC',
    postsPerPage: null,
    threadsPerPage: null,
    invisible: false,
    location: null,
    website: null,
    bio: null,
    displayGroupId: null,
  }
  readonly profiles: Array<{ userId: number; location: string | null }> = []
  readonly options: Array<{ userId: number; timezone: string }> = []
  readonly displayGroups: Array<number | null> = []
  held = [
    { groupId: 2, title: 'Registered', isPrimary: true, isStaff: false },
    { groupId: 5, title: 'Supporters', isPrimary: false, isStaff: false },
  ]

  async read(): Promise<MemberSettings | null> {
    return this.row
  }
  async groupsHeldBy() {
    return this.held
  }
  async saveDisplayGroup(input: { userId: number; displayGroupId: number | null }) {
    this.displayGroups.push(input.displayGroupId)
  }
  async saveProfile(input: { userId: number; location: string | null }) {
    this.profiles.push(input)
  }
  async saveOptions(input: { userId: number; timezone: string }) {
    this.options.push(input)
  }
  async adoptEmail() {
    return true
  }
}

let settings: FakeSettings

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

async function run(
  action: (prev: typeof EMPTY_STATE, form: FormData) => Promise<typeof EMPTY_STATE>,
  data: FormData,
): Promise<{ redirectedTo?: string; error?: string }> {
  try {
    const state = await action(EMPTY_STATE, data)
    return state.error === undefined ? {} : { error: state.error }
  } catch (err) {
    if (err instanceof RedirectError) return { redirectedTo: err.location }
    throw err
  }
}

async function install(): Promise<void> {
  const container = installTestContainer({ container: { memberSettings: settings } })
  const store = container.accountStore as {
    accounts: {
      create(input: Record<string, unknown>): Promise<{ id: number }>
    }
  }

  const { hashPassword } = await import('@meith/accounts')
  await store.accounts.create({
    username: 'ivan',
    usernameLower: 'ivan',
    email: 'ivan@example.test',
    emailLower: 'ivan@example.test',
    passwordHash: await hashPassword(PASSWORD),
    passwordAlgo: 'argon2id',
    state: 'active',
    primaryGroupId: SEED_GROUP.registered,
  })
}

beforeEach(async () => {
  settings = new FakeSettings()
  cookieRef.current = []
  mailRef.current = []
  actorRef.current = await actorFor(SEED_GROUP.registered, 1)
  await install()
}, 30_000)

describe('saving the profile', () => {
  it('saves for the signed-in member and returns to the screen', async () => {
    const result = await run(
      saveProfileAction,
      form([
        ['location', 'Cambridge'],
        ['website', ''],
        ['bio', 'Hello.'],
      ]),
    )

    expect(result.redirectedTo).toBe('/usercp/profile?saved=1')
    expect(settings.profiles[0]).toMatchObject({ userId: 1, location: 'Cambridge' })
  })

  it('takes the member from the session, never from the form', async () => {
    await run(
      saveProfileAction,
      form([
        ['location', 'Cambridge'],
        ['website', ''],
        ['bio', ''],
        ['userId', '999'],
      ]),
    )

    expect(settings.profiles[0]?.userId).toBe(1)
  })

  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const result = await run(
      saveProfileAction,
      form([
        ['location', 'Cambridge'],
        ['website', ''],
        ['bio', ''],
      ]),
    )

    expect(result.error).toContain('logged in')
    expect(settings.profiles).toEqual([])
  })

  it('refuses a board with no settings store rather than pretending', async () => {
    installTestContainer({ container: { memberSettings: null } })

    const result = await run(
      saveProfileAction,
      form([
        ['location', 'Cambridge'],
        ['website', ''],
        ['bio', ''],
      ]),
    )

    expect(result.error).toContain('sample data')
  })
})

describe('saving the options', () => {
  it('saves a timezone', async () => {
    const result = await run(
      saveOptionsAction,
      form([
        ['timezone', 'Europe/London'],
        ['postsPerPage', ''],
        ['threadsPerPage', ''],
      ]),
    )

    expect(result.redirectedTo).toBe('/usercp/options?saved=1')
    expect(settings.options[0]).toMatchObject({ userId: 1, timezone: 'Europe/London' })
  })

  it('reports a timezone the board does not recognise', async () => {
    const result = await run(
      saveOptionsAction,
      form([
        ['timezone', 'Middle/Earth'],
        ['postsPerPage', ''],
        ['threadsPerPage', ''],
      ]),
    )

    expect(result.error).toContain('not a timezone')
    expect(settings.options).toEqual([])
  })
})

describe('saving the display group', () => {
  it('saves a group the member is in', async () => {
    const result = await run(saveDisplayGroupAction, form([['displayGroupId', '5']]))

    expect(result.redirectedTo).toBe('/usercp/profile?saved=1')
    expect(settings.displayGroups).toEqual([5])
  })

  it('stores nothing for the member’s own primary group', async () => {
    await run(saveDisplayGroupAction, form([['displayGroupId', '2']]))
    expect(settings.displayGroups).toEqual([null])
  })

  it('refuses a group the member does not hold', async () => {
    const result = await run(saveDisplayGroupAction, form([['displayGroupId', '99']]))

    expect(result.error).toContain('a group you are in')
    expect(settings.displayGroups).toEqual([])
  })

  it('refuses staff, whose group is the one they were appointed to', async () => {
    settings.held = [
      { groupId: 4, title: 'Moderators', isPrimary: true, isStaff: true },
      { groupId: 5, title: 'Supporters', isPrimary: false, isStaff: false },
    ]

    const result = await run(saveDisplayGroupAction, form([['displayGroupId', '5']]))

    expect(result.error).toContain('appointed')
    expect(settings.displayGroups).toEqual([])
  })
})

describe('changing the password', () => {
  it('keeps this device signed in with a fresh session', async () => {
    const result = await run(
      changePasswordAction,
      form([
        ['currentPassword', PASSWORD],
        ['newPassword', 'a new long password'],
        ['confirmPassword', 'a new long password'],
      ]),
    )

    expect(result.redirectedTo).toBe('/usercp/security?changed=password')
    expect(cookieRef.current).toHaveLength(1)
  }, 30_000)

  it('refuses when the two new passwords differ, before touching anything', async () => {
    const result = await run(
      changePasswordAction,
      form([
        ['currentPassword', PASSWORD],
        ['newPassword', 'a new long password'],
        ['confirmPassword', 'a different long password'],
      ]),
    )

    expect(result.error).toContain('do not match')
    expect(cookieRef.current).toEqual([])
  })

  it('refuses without the current password, and starts no session', async () => {
    const result = await run(
      changePasswordAction,
      form([
        ['currentPassword', 'not it'],
        ['newPassword', 'a new long password'],
        ['confirmPassword', 'a new long password'],
      ]),
    )

    expect(result.error).toContain('not your current password')
    expect(cookieRef.current).toEqual([])
  }, 30_000)
})

describe('changing the e-mail address', () => {
  it('sends the confirmation to the new address and changes nothing yet', async () => {
    const result = await run(
      requestEmailChangeAction,
      form([
        ['currentPassword', PASSWORD],
        ['newEmail', 'new@example.test'],
      ]),
    )

    expect(result.redirectedTo).toBe('/usercp/security?sent=1')
    expect(mailRef.current[0]?.email).toBe('new@example.test')
    expect(settings.row.email).toBe('ivan@example.test')
  }, 30_000)

  it('refuses without the current password, and sends nothing', async () => {
    const result = await run(
      requestEmailChangeAction,
      form([
        ['currentPassword', 'not it'],
        ['newEmail', 'new@example.test'],
      ]),
    )

    expect(result.error).toContain('not your current password')
    expect(mailRef.current).toEqual([])
  }, 30_000)
})
