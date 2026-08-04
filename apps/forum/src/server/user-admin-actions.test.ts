/**
 * F67's writes, at the app layer.
 *
 * The SQL is proven against real Postgres in `@meith/db`. What is proven here
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
vi.mock('@meith/drivers', () => ({
  drivers: () => ({
    cache: {
      async invalidateTags(tags: string[]) {
        invalidated.push(tags)
      },
    },
    queue: {
      async enqueue(
        kind: string,
        payload: Record<string, unknown>,
        options?: { dedupeKey?: string },
      ) {
        enqueued.push({ kind, payload, ...(options?.dedupeKey === undefined ? {} : { dedupeKey: options.dedupeKey }) })
        return { id: 'job', deduplicated: false }
      },
    },
  }),
}))

const accounts: Array<{ userId: number; input: Record<string, unknown> }> = []
const states: Array<{ userId: number; state: string }> = []
const bans: Array<Record<string, unknown>> = []
const lifted: number[] = []
const secondaryGroups: Array<{ userId: number; groupIds: number[]; by: number | null }> = []
const chunks: Array<{ from: number; to: number; limit: number }> = []
const finished: Array<{ from: number; to: number }> = []
const chunkResult = { current: { moved: 2, remaining: 0 } }
const prunes: Array<{ criteria: Record<string, unknown>; limit: number }> = []
const campaigns: Array<Record<string, unknown>> = []
const claims: Array<{ massMailId: number; limit: number }> = []
const enqueued: Array<{ kind: string; payload: Record<string, unknown>; dedupeKey?: string }> = []
const pruneResult = { current: { pruned: 2, remaining: 0 } }
const claimResult = {
  current: {
    recipients: [{ userId: 1, email: 'a@example.test', username: 'ann' }],
    finished: true,
  },
}

vi.mock('./user-admin', () => ({
  requireUserAdmin: () => ({
    async updateAccount(userId: number, input: Record<string, unknown>) {
      accounts.push({ userId, input })
    },
    async setState(userId: number, state: string) {
      states.push({ userId, state })
    },
    async setSecondaryGroups(userId: number, groupIds: number[], by: number | null) {
      secondaryGroups.push({ userId, groupIds, by })
    },
  }),
  requireUserMerge: () => ({
    async mergePostsChunk(from: number, to: number, limit: number) {
      chunks.push({ from, to, limit })
      return chunkResult.current
    },
    async finish(from: number, to: number) {
      finished.push({ from, to })
    },
  }),
  requireUserBulk: () => ({
    async pruneChunk(criteria: Record<string, unknown>, limit: number) {
      prunes.push({ criteria, limit })
      return pruneResult.current
    },
    async createMassMail(input: Record<string, unknown>) {
      campaigns.push(input)
      return 55
    },
    async claimMassMailChunk(massMailId: number, limit: number) {
      claims.push({ massMailId, limit })
      return claimResult.current
    },
    async readMassMail() {
      return { queuedCount: 7 }
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
  continueMassMailAction,
  mergeStepAction,
  pruneMembersAction,
  saveMemberAccountAction,
  saveSecondaryGroupsAction,
  setMemberStateAction,
  startMassMailAction,
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
  secondaryGroups.length = 0
  chunks.length = 0
  finished.length = 0
  chunkResult.current = { moved: 2, remaining: 0 }
  prunes.length = 0
  campaigns.length = 0
  claims.length = 0
  enqueued.length = 0
  pruneResult.current = { pruned: 2, remaining: 0 }
  claimResult.current = {
    recipients: [{ userId: 1, email: 'a@example.test', username: 'ann' }],
    finished: true,
  }
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

describe('saveSecondaryGroupsAction', () => {
  it('submits the whole set, so an unticked box is a removal', async () => {
    /*
     * `user_group_memberships` has had a reader since F20 and never a writer.
     * The form shows every group with a checkbox, so what arrives *is* the
     * intended set — an empty submission means "no additional groups", not
     * "leave them alone". Kills the mutant that skips the write when nothing
     * was ticked, which would make removing the last group impossible.
     */
    await saveSecondaryGroupsAction({}, form({ userId: '7' }))

    expect(secondaryGroups).toEqual([{ userId: 7, groupIds: [], by: 1 }])
    expect(invalidated).toEqual([['permissions']])
  })

  it('passes the ticked groups through, and records who granted them', async () => {
    const data = new FormData()
    data.append('userId', '7')
    data.append('groupIds', '3')
    data.append('groupIds', '4')

    await saveSecondaryGroupsAction({}, data)
    expect(secondaryGroups[0]).toEqual({ userId: 7, groupIds: [3, 4], by: 1 })
  })

  it('refuses a group id that is not one', async () => {
    const data = new FormData()
    data.append('userId', '7')
    data.append('groupIds', 'staff')

    const state = await saveSecondaryGroupsAction({}, data)
    expect(state.error).toBeDefined()
    expect(secondaryGroups).toEqual([])
  })

  it('logs how many groups, never which', async () => {
    const data = new FormData()
    data.append('userId', '7')
    data.append('groupIds', '3')

    await saveSecondaryGroupsAction({}, data)
    expect(adminCalls[0]).toEqual({
      action: 'user.groups_changed',
      detail: { userId: 7, groups: 1 },
    })
  })
})

describe('mergeStepAction', () => {
  it('finishes in one press when there is nothing left to move', async () => {
    const state = await mergeStepAction({}, form({ userId: '7', toUserId: '3' }))

    expect(chunks).toEqual([{ from: 7, to: 3, limit: 500 }])
    expect(finished).toEqual([{ from: 7, to: 3 }])
    expect(state.notice).toBe('merged')
    expect(invalidated).toEqual([['permissions']])
  })

  it('stops after a batch while posts remain, and does not finish', async () => {
    /*
     * The claim that makes the chunking safe. `finish` refuses while posts
     * remain, but calling it at all would be a wasted transaction on a table
     * this size — and reporting "merged" after one batch would tell an operator
     * a half-done merge was complete. Kills the mutant that always finishes.
     */
    chunkResult.current = { moved: 500, remaining: 1_200 }

    const state = await mergeStepAction({}, form({ userId: '7', toUserId: '3' }))

    expect(finished).toEqual([])
    expect(state.notice).toBe('more')
    expect(state.values?.remaining).toBe('1200')
  })

  it('refuses to merge an account into itself', async () => {
    const state = await mergeStepAction({}, form({ userId: '7', toUserId: '7' }))

    expect(state.error).toBeDefined()
    expect(chunks).toEqual([])
  })

  it('refuses without a destination', async () => {
    const state = await mergeStepAction({}, form({ userId: '7' }))
    expect(state.error).toBeDefined()
    expect(chunks).toEqual([])
  })

  it('is re-authenticated, because a merge has no undo', async () => {
    await mergeStepAction({}, form({ userId: '7', toUserId: '3' }))
    expect(requireFreshAdminMock).toHaveBeenCalledTimes(1)
    expect(requireAdminMock).not.toHaveBeenCalled()
  })
})

describe('pruneMembersAction', () => {
  it('passes the confirmed criteria through, not something re-read elsewhere', async () => {
    /*
     * The operator approved a dry run against *these* dates. A prune that
     * rebuilt its criteria from anywhere else would be acting on a preview
     * nobody saw. Kills the mutant that ignores the submitted fields.
     */
    const state = await pruneMembersAction(
      {},
      form({ before: '2025-01-01', inactive: '2024-01-01', awaiting: '1' }),
    )

    expect(prunes[0]?.limit).toBe(500)
    expect(prunes[0]?.criteria).toMatchObject({ onlyAwaitingActivation: true })
    expect((prunes[0]?.criteria.registeredBefore as Date).toISOString())
      .toBe('2025-01-01T00:00:00.000Z')
    expect(state.notice).toBe('finished')
  })

  it('refuses without a registration boundary, which would match everybody', async () => {
    const state = await pruneMembersAction({}, form({}))
    expect(state.error).toBeDefined()
    expect(prunes).toEqual([])
  })

  it('refuses an inactivity date that is not a date', async () => {
    const state = await pruneMembersAction(
      {},
      form({ before: '2025-01-01', inactive: 'ages ago' }),
    )
    expect(state.error).toBeDefined()
    expect(prunes).toEqual([])
  })

  it('reports more to do while accounts remain', async () => {
    pruneResult.current = { pruned: 500, remaining: 120 }
    const state = await pruneMembersAction({}, form({ before: '2025-01-01' }))

    expect(state.notice).toBe('more')
    expect(state.values?.remaining).toBe('120')
  })

  it('is re-authenticated', async () => {
    await pruneMembersAction({}, form({ before: '2025-01-01' }))
    expect(requireFreshAdminMock).toHaveBeenCalledTimes(1)
    expect(requireAdminMock).not.toHaveBeenCalled()
  })
})

describe('mass mail', () => {
  it('enqueues one job per recipient rather than one for the batch', async () => {
    /*
     * A provider rejecting one address then costs that member's message a retry
     * rather than the whole batch's, and the queue's dead-letter list becomes
     * the record of who could not be reached. Kills the mutant that enqueues a
     * single job carrying the whole list.
     */
    claimResult.current = {
      recipients: [
        { userId: 1, email: 'a@example.test', username: 'ann' },
        { userId: 2, email: 'b@example.test', username: 'bob' },
      ],
      finished: true,
    }

    await startMassMailAction({}, form({ subject: 'Hi', body: 'All' }))

    expect(enqueued).toHaveLength(2)
    expect(enqueued[0]).toEqual({
      kind: 'admin.mass_mail',
      payload: { massMailId: 55, userId: 1, email: 'a@example.test' },
      dedupeKey: 'mass-mail:55:1',
    })
  })

  it('sends nothing itself — the driver is only touched in the tick', async () => {
    /*
     * F55's rule. An SMTP provider hanging for ten seconds must not be a
     * ten-second Server Action, so this enqueues and returns.
     */
    await startMassMailAction({}, form({ subject: 'Hi', body: 'All' }))
    expect(enqueued.every((job) => job.kind === 'admin.mass_mail')).toBe(true)
  })

  it('dedupes per member per campaign, so a double submit mails nobody twice', async () => {
    await startMassMailAction({}, form({ subject: 'Hi', body: 'All' }))
    expect(enqueued[0]?.dedupeKey).toBe('mass-mail:55:1')
  })

  it('records the campaign and its target, never the body', async () => {
    await startMassMailAction(
      {},
      form({ subject: 'Downtime', body: 'secret internal wording', targetGroupId: '3' }),
    )

    expect(campaigns[0]).toMatchObject({ subject: 'Downtime', targetGroupId: 3 })
    expect(adminCalls[0]).toEqual({
      action: 'user.mass_mail_started',
      detail: { massMailId: 55, targetGroupId: 3 },
    })
    expect(JSON.stringify(adminCalls)).not.toContain('secret internal wording')
  })

  it('continues an existing campaign rather than starting a new one', async () => {
    /*
     * Restarting a mass mail is not a neutral act — it is mailing everybody
     * twice. Kills the mutant that creates a second campaign on continue.
     */
    claimResult.current = {
      recipients: [{ userId: 3, email: 'c@example.test', username: 'cal' }],
      finished: false,
    }

    const state = await continueMassMailAction({}, form({ massMailId: '55' }))

    expect(campaigns).toEqual([])
    expect(claims[0]).toEqual({ massMailId: 55, limit: 500 })
    expect(state.notice).toBe('more')
    expect(state.values?.queued).toBe('7')
  })

  it('refuses to continue a campaign that is not one', async () => {
    const state = await continueMassMailAction({}, form({ massMailId: 'latest' }))
    expect(state.error).toBeDefined()
    expect(claims).toEqual([])
  })

  it('is re-authenticated, because an email cannot be unsent', async () => {
    await startMassMailAction({}, form({ subject: 'Hi', body: 'All' }))
    expect(requireFreshAdminMock).toHaveBeenCalledTimes(1)
    expect(requireAdminMock).not.toHaveBeenCalled()
  })
})
