import { describe, expect, it, vi } from 'vitest'

const calls: string[] = []

vi.mock('./container', () => ({
  getContainer: () => ({
    dataSource: 'postgres',
    authorizer: { forumIdsWhere: async () => [1] },
  }),
}))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresDiscoveryRepository: class {
    async activeSince(since: Date) {
      calls.push(`activeSince:${since.toISOString()}`)
      return { rows: [], nextCursor: null }
    }
    async unanswered() {
      calls.push('unanswered')
      return { rows: [], nextCursor: null }
    }
    async startedBy(userId: number) {
      calls.push(`startedBy:${userId}`)
      return { rows: [], nextCursor: null }
    }
    async participatedIn(userId: number) {
      calls.push(`participatedIn:${userId}`)
      return { rows: [], nextCursor: null }
    }
  },
}))

const { DISCOVERY_VIEWS, isDiscoveryView, runDiscovery, startOfDay } = await import('./discovery')
const { emptyPermissionSet, isAppError } = await import('@meith/core')

const guest = {
  userId: null,
  groupIds: [1],
  primaryGroupId: 1,
  state: 'guest',
  global: emptyPermissionSet(),
  permissionVersion: 1,
} as const

const member = { ...guest, userId: 42, state: 'active' } as const

async function run(view: string, actor: typeof guest | typeof member) {
  calls.length = 0
  await runDiscovery({
    actor: actor as never,
    view: view as never,
    now: new Date('2026-03-01T20:00:00Z'),
    timeZone: 'UTC',
    after: null,
  })
  return calls
}

describe('isDiscoveryView', () => {
  it('accepts every view the page offers', () => {
    for (const view of DISCOVERY_VIEWS) expect(isDiscoveryView(view)).toBe(true)
  })

  it('rejects anything else, including near misses', () => {
    for (const value of ['', 'news', 'NEW', 'ne', 'all', '../admin'])
      expect(isDiscoveryView(value)).toBe(false)
  })
})

describe('startOfDay', () => {
  it('is midnight in the viewer’s zone, not the server’s', () => {
    const now = new Date('2026-03-01T20:00:00Z')

    expect(startOfDay(now, 'Pacific/Auckland').toISOString()).toBe('2026-03-01T11:00:00.000Z')
    expect(startOfDay(now, 'UTC').toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('is behind the moment asked about, in a zone ahead of UTC', () => {
    const now = new Date('2026-03-01T20:00:00Z')
    for (const zone of ['Pacific/Auckland', 'Asia/Tokyo', 'UTC', 'America/Los_Angeles'])
      expect(startOfDay(now, zone).getTime()).toBeLessThanOrEqual(now.getTime())
  })

  it('is right on the day the clocks change', () => {
    expect(startOfDay(new Date('2026-03-29T12:00:00Z'), 'Europe/London').toISOString()).toBe(
      '2026-03-29T00:00:00.000Z',
    )

    expect(startOfDay(new Date('2026-06-15T12:00:00Z'), 'Europe/London').toISOString()).toBe(
      '2026-06-14T23:00:00.000Z',
    )
  })

  it('falls back to a day window for a zone the runtime does not know', () => {
    const now = new Date('2026-03-01T20:00:00Z')
    expect(startOfDay(now, 'Middle/Earth').toISOString()).toBe('2026-02-28T20:00:00.000Z')
  })
})

describe('runDiscovery', () => {
  it('asks each view its own question', async () => {
    expect(await run('unanswered', member)).toEqual(['unanswered'])
    expect(await run('mine', member)).toEqual(['startedBy:42'])
    expect(await run('participated', member)).toEqual(['participatedIn:42'])
  })

  it('starts "today" at midnight and "new" a day back', async () => {
    expect(await run('today', member)).toEqual(['activeSince:2026-03-01T00:00:00.000Z'])
    expect(await run('new', member)).toEqual(['activeSince:2026-02-28T20:00:00.000Z'])
  })

  it('refuses a personal view to a guest instead of showing an empty list', async () => {
    for (const view of ['mine', 'participated']) {
      await expect(run(view, guest)).rejects.toSatisfy(isAppError)
    }
  })

  it('lets a guest use the views that are not about them', async () => {
    expect(await run('new', guest)).toHaveLength(1)
    expect(await run('unanswered', guest)).toEqual(['unanswered'])
  })
})
