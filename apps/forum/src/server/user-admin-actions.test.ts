/**
 * F67's writes, at the app layer.
 *
 * The SQL is proven against real Postgres in `@forum/db`. What is proven here
 * is what only this adapter can get wrong, and the one that matters most is
 * about *which mechanism* a ban goes through:
 *
 * **banning is `BanService`, never a state write.** F23 captures the group the
 * member held so an expiring ban can restore it; a ban applied as a state
 * change produces a member whose column says banned with no ban row behind it —
 * un-bannable, and invisible until somebody tries.
 *
 * The other two: the two ban reasons stay separate (the staff note must never
 * reach the person it is about), and every write clears the permission tag.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ session: { userId: 1 } }))
const requireFreshAdminMock = vi.fn(async () => ({ session: { userId: 1 } }))
vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireFreshAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const invalidated: string[][] = []
vi.mock('@forum/drivers', () => ({
  drivers: () => ({
    cache: {
      async invalidateTags(tags: string[]) {
        invalidated.push(tags)
      },
    },
  }),
}))

const accounts: Array<{ userId: number; input: Record<string, unknown> }> = []
const states: Array<{ userId: number; state: string }> = []
const bans: Array<Record<string, unknown>> = []
const lifted: number[] = []

vi.mock('./user-admin', () => ({
  requireUserAdmin: () => ({
    async updateAccount(userId: number, input: Record<string, unknown>) {
      accounts.push({ userId, input })
    },
    async setState(userId: number, state: string) {
      states.push({ userId, state })
    },
  }),
  banService: () => ({
    async ban(input: Record<string, unknown>) {
      bans.push(input)
    },
    async lift(userId: number) {
      lifted.push(userId)
    },
  }),
}))

const {
  banMemberAction,
  liftBanAction,
  saveMemberAccountAction,
  setMemberStateAction,
} = await import('./user-admin-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  invalidated.length = 0
  accounts.length = 0
  states.length = 0
  bans.length = 0
  lifted.length = 0
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ session: { userId: 1 } })
  requireFreshAdminMock.mockClear()
  requireFreshAdminMock.mockResolvedValue({ session: { userId: 1 } })
})

describe('the admin gate', () => {
  it('is asked for on every write', async () => {
    await saveMemberAccountAction({}, form({ userId: '7', username: 'a', email: 'a@b.test', primaryGroupId: '2' }))
    await setMemberStateAction({}, form({ userId: '7', state: 'active' }))
    await liftBanAction({}, form({ userId: '7' }))
    expect(requireAdminMock).toHaveBeenCalledTimes(3)
  })

  it('re-authenticates a ban, because it locks somebody out with no undo', async () => {
    await banMemberAction({}, form({ userId: '7' }))
    expect(requireFreshAdminMock).toHaveBeenCalledTimes(1)
    expect(requireAdminMock).not.toHaveBeenCalled()
  })

  it('writes nothing when it refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await setMemberStateAction({}, form({ userId: '7', state: 'active' }))
    expect(state.error).toBeDefined()
    expect(states).toEqual([])
    expect(invalidated).toEqual([])
  })
})

describe('saveMemberAccountAction', () => {
  it('passes the account through and clears the permission tag', async () => {
    const result = await saveMemberAccountAction(
      {},
      form({
        userId: '7',
        username: 'Annabel',
        email: 'ann@example.test',
        primaryGroupId: '3',
        displayGroupId: '4',
      }),
    )

    expect(result.notice).toBe('saved')
    expect(accounts[0]).toEqual({
      userId: 7,
      input: {
        username: 'Annabel',
        email: 'ann@example.test',
        primaryGroupId: 3,
        displayGroupId: 4,
      },
    })
    expect(invalidated).toEqual([['permissions']])
  })

  it('reads a blank display group as null, meaning "same as primary"', async () => {
    await saveMemberAccountAction(
      {},
      form({ userId: '7', username: 'a', email: 'a@b.test', primaryGroupId: '2', displayGroupId: '' }),
    )
    expect(accounts[0]?.input.displayGroupId).toBeNull()
  })

  it('refuses a primary group that is not an id', async () => {
    const state = await saveMemberAccountAction(
      {},
      form({ userId: '7', username: 'a', email: 'a@b.test', primaryGroupId: 'none' }),
    )
    expect(state.error).toBeDefined()
    expect(accounts).toEqual([])
  })

  it('logs the member but never the address', async () => {
    /*
     * An email is the member's, and the admin log is read by more people than
     * can edit an account — F64's rule about setting values, applied here.
     * Kills the mutant that puts the payload in the audit detail.
     */
    await saveMemberAccountAction(
      {},
      form({ userId: '7', username: 'a', email: 'secret@example.test', primaryGroupId: '2' }),
    )

    expect(adminCalls[0]).toEqual({ action: 'user.account_changed', detail: { userId: 7 } })
    expect(JSON.stringify(adminCalls)).not.toContain('secret@example.test')
  })
})

describe('setMemberStateAction', () => {
  it('activates a member', async () => {
    const state = await setMemberStateAction({}, form({ userId: '7', state: 'active' }))
    expect(state.notice).toBe('saved')
    expect(states).toEqual([{ userId: 7, state: 'active' }])
  })

  it('refuses `banned`, so the screen cannot fake a ban', async () => {
    /*
     * The claim this file is about. A state write cannot capture the group F23
     * restores on expiry, so a "ban" issued this way is one nothing can lift
     * correctly. The repository refuses it too; both guards exist because they
     * protect different things — that one keeps the column honest, this one
     * keeps the screen from offering the operation. Kills the mutant that
     * accepts whatever state arrived.
     */
    const state = await setMemberStateAction({}, form({ userId: '7', state: 'banned' }))

    expect(state.error).toBeDefined()
    expect(states).toEqual([])
    expect(bans).toEqual([])
  })

  it('refuses a state that does not exist', async () => {
    const state = await setMemberStateAction({}, form({ userId: '7', state: 'vanished' }))
    expect(state.error).toBeDefined()
    expect(states).toEqual([])
  })
})

describe('banMemberAction', () => {
  it('is permanent when no length is given', async () => {
    await banMemberAction({}, form({ userId: '7' }))

    expect(bans[0]).toMatchObject({ userId: 7, bannedByUserId: 1 })
    expect(bans[0]?.expiresAt).toBeUndefined()
  })

  it('turns a length in days into an expiry', async () => {
    await banMemberAction({}, form({ userId: '7', days: '3' }))

    const expiresAt = bans[0]?.expiresAt as Date
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(2.9)
    expect(days).toBeLessThan(3.1)
  })

  it('refuses a length that is not a positive whole number of days', async () => {
    for (const days of ['0', '-1', 'soon', '1.5']) {
      const state = await banMemberAction({}, form({ userId: '7', days }))
      expect(state.error, days).toBeDefined()
    }
    expect(bans).toEqual([])
  })

  it('keeps the two reasons apart', async () => {
    /*
     * `reason` is the staff note and routinely says things that must never
     * reach the person it is about; `publicReason` is what F23 shows them on a
     * login attempt. Kills the mutant that passes one field as both.
     */
    await banMemberAction(
      {},
      form({
        userId: '7',
        reason: 'linked to the account we banned last week',
        publicReason: 'Spam',
      }),
    )

    expect(bans[0]).toMatchObject({
      reason: 'linked to the account we banned last week',
      publicReason: 'Spam',
    })
  })

  it('never puts the staff note in the audit log', async () => {
    await banMemberAction({}, form({ userId: '7', days: '3', reason: 'sockpuppet of #12' }))

    expect(adminCalls[0]).toEqual({
      action: 'user.banned',
      detail: { userId: 7, days: 3 },
    })
    expect(JSON.stringify(adminCalls)).not.toContain('sockpuppet')
  })
})

describe('liftBanAction', () => {
  it('goes through the service, so the captured group is what comes back', async () => {
    const state = await liftBanAction({}, form({ userId: '7' }))

    expect(state.notice).toBe('lifted')
    expect(lifted).toEqual([7])
    expect(invalidated).toEqual([['permissions']])
  })
})
