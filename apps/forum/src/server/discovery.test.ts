/**
 * F74 at the app layer.
 *
 * The repository's own tests cover the SQL; what is left here is the three
 * things the page depends on and neither Postgres nor TypeScript can check:
 * **which strings name a view**, **which question each view asks**, and **when
 * "today" starts for this viewer**.
 *
 * The zone arithmetic is the one worth the file. It is easy to write a version
 * that is right in London in January and wrong everywhere else for half the
 * year, and the failure is invisible: a list that quietly misses the morning's
 * threads, or shows yesterday's.
 */
import { describe, expect, it, vi } from 'vitest'

/**
 * The container and the repository are stubbed so the dispatch can be tested
 * without a database: **which repository method each view calls** is a
 * five-way switch, and a swapped pair of cases is invisible to every other
 * test — both branches return a page of threads.
 */
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
    /*
     * Against the list rather than a hardcoded copy, so adding a sixth view
     * cannot leave the guard rejecting the route the page renders a tab for.
     */
    for (const view of DISCOVERY_VIEWS) expect(isDiscoveryView(view)).toBe(true)
  })

  it('rejects anything else, including near misses', () => {
    /*
     * The segment comes from the URL, and the page 404s on a false. A guard
     * that accepted a prefix or was case-insensitive would let `/discover/NEW`
     * through to a lookup keyed on a string that is not in the table.
     */
    for (const value of ['', 'news', 'NEW', 'ne', 'all', '../admin'])
      expect(isDiscoveryView(value)).toBe(false)
  })
})

describe('startOfDay', () => {
  it('is midnight in the viewer’s zone, not the server’s', () => {
    /*
     * The whole reason this function exists. 09:00 in Auckland on the 2nd is
     * 20:00 UTC on the 1st; a server that used its own midnight would answer
     * "today" with the previous Auckland day and hide everything the member
     * has read this morning. Kills the mutant that ignores the zone.
     */
    const now = new Date('2026-03-01T20:00:00Z')

    expect(startOfDay(now, 'Pacific/Auckland').toISOString()).toBe('2026-03-01T11:00:00.000Z')
    expect(startOfDay(now, 'UTC').toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('is behind the moment asked about, in a zone ahead of UTC', () => {
    /*
     * The invariant that matters more than any single offset: midnight is in
     * the past. A sign error in the offset produces a boundary in the future,
     * and `activeSince` then returns an empty list on a busy board — which
     * reads as "nothing happened today" rather than as a bug.
     */
    const now = new Date('2026-03-01T20:00:00Z')
    for (const zone of ['Pacific/Auckland', 'Asia/Tokyo', 'UTC', 'America/Los_Angeles'])
      expect(startOfDay(now, zone).getTime()).toBeLessThanOrEqual(now.getTime())
  })

  it('is right on the day the clocks change', () => {
    /*
     * 2026-03-29 is when Europe/London moves to BST at 01:00 UTC. Midnight
     * local is still 00:00 UTC that day, and a version that assumed a fixed
     * offset per zone — or that took yesterday's — lands an hour out. An hour
     * is exactly enough to drop the first posts of the morning.
     */
    expect(startOfDay(new Date('2026-03-29T12:00:00Z'), 'Europe/London').toISOString()).toBe(
      '2026-03-29T00:00:00.000Z',
    )

    /* And after the change, midnight local is 23:00 UTC the day before. */
    expect(startOfDay(new Date('2026-06-15T12:00:00Z'), 'Europe/London').toISOString()).toBe(
      '2026-06-14T23:00:00.000Z',
    )
  })

  it('falls back to a day window for a zone the runtime does not know', () => {
    /*
     * The zone is a member's stored preference (F57 validates on the way in,
     * but a tz database shipping a rename is not a reason to fail a page).
     * A day back is wrong by hours at worst; throwing here would 500 the page
     * for one member and nobody else, which is the hardest kind to diagnose.
     */
    const now = new Date('2026-03-01T20:00:00Z')
    expect(startOfDay(now, 'Middle/Earth').toISOString()).toBe('2026-02-28T20:00:00.000Z')
  })
})

describe('runDiscovery', () => {
  it('asks each view its own question', async () => {
    /*
     * The switch, pinned view by view. Kills the mutant that swaps two cases —
     * "my threads" showing threads you merely replied in, or "unanswered"
     * showing everything, are both wrong lists that look entirely plausible on
     * screen and that no other test would notice.
     */
    expect(await run('unanswered', member)).toEqual(['unanswered'])
    expect(await run('mine', member)).toEqual(['startedBy:42'])
    expect(await run('participated', member)).toEqual(['participatedIn:42'])
  })

  it('starts "today" at midnight and "new" a day back', async () => {
    /*
     * Both go through `activeSince`, so the only thing separating them is the
     * instant — and a mutant that passed the same one to both would collapse
     * two views into one without failing anything above.
     */
    expect(await run('today', member)).toEqual(['activeSince:2026-03-01T00:00:00.000Z'])
    expect(await run('new', member)).toEqual(['activeSince:2026-02-28T20:00:00.000Z'])
  })

  it('refuses a personal view to a guest instead of showing an empty list', async () => {
    /*
     * "No threads" and "you are not signed in" render identically and lead to
     * opposite next actions. The page turns this refusal into a sign-in link.
     */
    for (const view of ['mine', 'participated']) {
      await expect(run(view, guest)).rejects.toSatisfy(isAppError)
    }
  })

  it('lets a guest use the views that are not about them', async () => {
    expect(await run('new', guest)).toHaveLength(1)
    expect(await run('unanswered', guest)).toEqual(['unanswered'])
  })
})
