import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@meith/authorization'
import { emptyPermissionSet, type PermissionSet } from '@meith/core'

const FORUM_SCOPED = new Set(['content.viewUnapproved'])

const state = vi.hoisted(() => ({
  dataSource: 'postgres' as 'postgres' | 'fixture',
  bypassesFlood: false,
  counts: new Map<string, number>(),
  storeThrows: false,
  firstPostThreshold: 0,
}))

vi.mock('./request-fingerprint', () => ({ countingPrefix: async () => null }))
vi.mock('./settings', () => ({
  getSettings: async () => ({ get: () => state.firstPostThreshold }),
}))

vi.mock('./container', () => ({
  getContainer: () => ({
    dataSource: state.dataSource,
    authorizer: {
      can: (_actor: Actor, action: string, target?: unknown) => {
        if (FORUM_SCOPED.has(action) && target === undefined) {
          throw new Error(
            `Forum-scoped action "${action}" requires target.forum (resolved matrix).`,
          )
        }
        return state.bypassesFlood
      },
      globalLimit: (actor: Actor, key: keyof PermissionSet) => {
        const value = actor.global[key]
        return typeof value === 'number' ? value : 0
      },
    },
  }),
}))

vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresCaptchaQuestionRepository: class {},
  PostgresRateLimitBucketStore: class {
    async spend(
      subject: { scope: string; subject: string },
      windowStart: Date,
      cost: number,
    ): Promise<number> {
      if (state.storeThrows) throw new Error('no database')
      const key = `${subject.scope}|${subject.subject}|${windowStart.toISOString()}`
      const next = (state.counts.get(key) ?? 0) + cost
      state.counts.set(key, next)
      return next
    }
    async peek(subject: { scope: string; subject: string }, windowStart: Date): Promise<number> {
      const key = `${subject.scope}|${subject.subject}|${windowStart.toISOString()}`
      return state.counts.get(key) ?? 0
    }
    async prune(): Promise<number> {
      return 0
    }
  },
}))

const { dailyLimitMessage, holdsNewMember, refused, spendDailyLimit } = await import('./antispam')

function member(over: Partial<PermissionSet>, userId: number | null = 7): Actor {
  return {
    userId,
    groupIds: [2],
    primaryGroupId: 2,
    state: userId === null ? 'guest' : 'active',
    global: { ...emptyPermissionSet(), ...over },
    permissionVersion: 1,
  }
}

async function spend(actor: Actor, times: number): Promise<boolean[]> {
  const out: boolean[] = []
  for (let i = 0; i < times; i += 1) {
    const outcome = await spendDailyLimit({ scope: 'post_day', actor })
    out.push(!refused(outcome))
  }
  return out
}

beforeEach(() => {
  state.dataSource = 'postgres'
  state.bypassesFlood = false
  state.storeThrows = false
  state.counts.clear()
})

describe('spendDailyLimit', () => {
  it('allows up to the group’s cap and refuses the one past it', async () => {
    const actor = member({ maxPostsPerDay: 3 })

    expect(await spend(actor, 4)).toEqual([true, true, true, false])
  })

  it('treats 0 as unlimited and spends nothing at all', async () => {
    const actor = member({ maxPostsPerDay: 0 })

    expect(await spend(actor, 50)).toEqual(Array(50).fill(true))
    expect(state.counts.size).toBe(0)
  })

  it('counts each member separately', async () => {
    const one = member({ maxPostsPerDay: 1 }, 7)
    const other = member({ maxPostsPerDay: 1 }, 8)

    expect(await spend(one, 2)).toEqual([true, false])
    expect(await spend(other, 1)).toEqual([true])
  })

  it('is not lifted by bypass flood check, which is the interval and the hourly limits', async () => {
    state.bypassesFlood = true
    const actor = member({ maxPostsPerDay: 1 })

    expect(await spend(actor, 2)).toEqual([true, false])
  })

  it('does nothing for a guest, who has no bucket to count against', async () => {
    expect(
      await spendDailyLimit({ scope: 'post_day', actor: member({ maxPostsPerDay: 1 }, null) }),
    ).toBeNull()
    expect(state.counts.size).toBe(0)
  })

  it('does nothing on a board with no database behind it', async () => {
    state.dataSource = 'fixture'

    expect(
      await spendDailyLimit({ scope: 'post_day', actor: member({ maxPostsPerDay: 1 }) }),
    ).toBeNull()
  })

  it('lets the board keep working when the counter is unavailable', async () => {
    state.storeThrows = true

    expect(
      await spendDailyLimit({ scope: 'post_day', actor: member({ maxPostsPerDay: 1 }) }),
    ).toBeNull()
  })

  it('counts against a day rather than an hour', async () => {
    await spendDailyLimit({ scope: 'post_day', actor: member({ maxPostsPerDay: 1 }) })

    const [key] = [...state.counts.keys()]
    expect(key).toMatch(/T00:00:00\.000Z$/)
  })
})

describe('spendDailyLimit for private messages', () => {
  it('reads its own permission and keeps its own bucket', async () => {
    const actor = member({ maxPrivateMessagesPerDay: 2, maxPostsPerDay: 1 })

    expect(await spendDailyLimit({ scope: 'message_day', actor })).toMatchObject({ allowed: true })
    expect(await spendDailyLimit({ scope: 'message_day', actor })).toMatchObject({ allowed: true })
    expect(refused(await spendDailyLimit({ scope: 'message_day', actor }))).toBe(true)

    expect(await spendDailyLimit({ scope: 'post_day', actor })).toMatchObject({ allowed: true })
  })

  it('is unlimited at 0 even where the post cap is set', async () => {
    const actor = member({ maxPrivateMessagesPerDay: 0, maxPostsPerDay: 1 })

    for (let i = 0; i < 20; i += 1) {
      expect(await spendDailyLimit({ scope: 'message_day', actor })).toBeNull()
    }
  })
})

describe('dailyLimitMessage', () => {
  it('speaks in hours rather than the hundreds of minutes a day contains', () => {
    expect(
      dailyLimitMessage('post_day', { allowed: false, used: 9, retryAfterSeconds: 36_000 }),
    ).toBe('You have used your allowance of posts for today. It resets in 10 hours.')
  })

  it('rounds the last stretch to within the hour', () => {
    expect(dailyLimitMessage('post_day', { allowed: false, used: 9, retryAfterSeconds: 120 })).toBe(
      'You have used your allowance of posts for today. It resets within the hour.',
    )
  })

  it('names what ran out', () => {
    expect(
      dailyLimitMessage('message_day', { allowed: false, used: 9, retryAfterSeconds: 7200 }),
    ).toBe('You have used your allowance of private messages for today. It resets in 2 hours.')
  })
})

describe('holding a new member for review', () => {
  const FORUM_TARGET = { forum: { id: 1 } } as never

  beforeEach(() => {
    state.firstPostThreshold = 0
    state.bypassesFlood = false
  })

  it('does nothing while the setting is off', async () => {
    state.firstPostThreshold = 0
    await expect(
      holdsNewMember({ actor: member({}), postCount: 0, target: FORUM_TARGET }),
    ).resolves.toBe(false)
  })

  it('holds a member under the threshold', async () => {
    state.firstPostThreshold = 5
    await expect(
      holdsNewMember({ actor: member({}), postCount: 1, target: FORUM_TARGET }),
    ).resolves.toBe(true)
  })

  it('lets a member past the threshold through', async () => {
    state.firstPostThreshold = 5
    await expect(
      holdsNewMember({ actor: member({}), postCount: 9, target: FORUM_TARGET }),
    ).resolves.toBe(false)
  })

  it('lets someone who may see unapproved content through', async () => {
    state.firstPostThreshold = 5
    state.bypassesFlood = true
    await expect(
      holdsNewMember({ actor: member({}), postCount: 1, target: FORUM_TARGET }),
    ).resolves.toBe(false)
  })

  it('holds the post when it cannot tell who bypasses moderation', async () => {
    state.firstPostThreshold = 5
    await expect(
      holdsNewMember({ actor: member({}), postCount: 1, target: undefined as never }),
    ).resolves.toBe(true)
  })
})
