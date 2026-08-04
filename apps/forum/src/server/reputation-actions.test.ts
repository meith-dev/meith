/**
 * F62 at the app layer.
 *
 * The rules are unit-tested in `@meith/reputation` and the SQL against real
 * Postgres. What is proven here is the seam neither can see:
 *
 *  - the rater is the *session's* member, never the form's;
 *  - the permission and the daily cap come from the Authorizer, which is the
 *    only thing on this board allowed to resolve either;
 *  - the board settings reach the service, so switching reputation off closes
 *    the action and not only the screen;
 *  - `returnTo` cannot be turned into an open redirect.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InMemoryAuthorizationSource, combinePermissionSets } from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import type {
  ReputationRepository,
  ReputationRow,
  ReputationSummary,
} from '@meith/reputation'

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

/** The board settings, without a settings table behind them. */
const settingsRef = {
  current: {
    'reputation.enabled': true,
    'reputation.allow_negative': true,
    'reputation.comment_required': true,
    'reputation.min_posts_to_give': 5,
  } as Record<string, unknown>,
}
vi.mock('./settings', () => ({
  getSettings: async () => ({ get: (key: string) => settingsRef.current[key] }),
}))

const { rateMemberAction, withdrawRatingAction } = await import('./reputation-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const TARGET = 1
const RATER = 2

class FakeReputation implements ReputationRepository {
  rows: ReputationRow[] = []
  given: Array<{ userId: number; givenByUserId: number; points: number; postId: number | null }> =
    []
  atCap = false

  async give(input: {
    userId: number
    givenByUserId: number
    postId: number | null
    points: number
    comment: string
    maxPerDay: number
    at: Date
  }) {
    if (this.atCap) return false
    this.given.push({
      userId: input.userId,
      givenByUserId: input.givenByUserId,
      points: input.points,
      postId: input.postId,
    })
    return true
  }
  async withdraw(input: { ratingId: number; givenByUserId: number }) {
    const before = this.rows.length
    this.rows = this.rows.filter(
      (row) => !(row.id === input.ratingId && row.givenByUserId === input.givenByUserId),
    )
    return this.rows.length < before
  }
  async list() {
    return this.rows
  }
  async summary(): Promise<ReputationSummary> {
    return { total: 0, positive: 0, neutral: 0, negative: 0 }
  }
  async existing() {
    return null
  }
  async givenSince() {
    return 0
  }
  async recount() {
    return 0
  }
}

let reputation: FakeReputation

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

/** A container whose profile read reports enough posts to clear the floor. */
function install(postCount = 20): void {
  installTestContainer({
    container: {
      reputation,
      memberProfiles: {
        findPublicById: async (id: number) => ({
          id,
          username: `user${id}`,
          title: null,
          postCount,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          lastActiveAt: null,
          location: null,
          website: null,
          bio: null,
        }),
      },
    },
  })
}

beforeEach(async () => {
  reputation = new FakeReputation()
  settingsRef.current = {
    'reputation.enabled': true,
    'reputation.allow_negative': true,
    'reputation.comment_required': true,
    'reputation.min_posts_to_give': 5,
  }
  actorRef.current = await actorFor(SEED_GROUP.registered, RATER)
  install()
})

describe('rating somebody', () => {
  it('records it for the signed-in member and comes back to the page', async () => {
    const result = await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', '1'],
        ['comment', 'Helpful answer.'],
      ]),
    )

    expect(result.redirectedTo).toBe('/member/1?rated=1')
    expect(reputation.given).toEqual([
      { userId: TARGET, givenByUserId: RATER, points: 1, postId: null },
    ])
  })

  it('takes the rater from the session, never from the form', async () => {
    await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', '1'],
        ['comment', 'Helpful.'],
        /* A submitted rater is simply not read. */
        ['givenByUserId', '999'],
      ]),
    )

    expect(reputation.given[0]?.givenByUserId).toBe(RATER)
  })

  it('attaches the rating to a post when one is named', async () => {
    await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['postId', '42'],
        ['points', '1'],
        ['comment', 'Good post.'],
      ]),
    )

    expect(reputation.given[0]?.postId).toBe(42)
  })

  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const result = await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', '1'],
        ['comment', 'Helpful.'],
      ]),
    )

    expect(result.error).toContain('logged in')
    expect(reputation.given).toEqual([])
  })

  it('refuses a group without the permission', async () => {
    /*
     * Kills the mutant that stops consulting the Authorizer: the guest group's
     * defaults do not grant `reputation.give`, and this actor is a real
     * signed-in member so the logged-in branch cannot fire instead.
     */
    actorRef.current = await actorFor(SEED_GROUP.guest, RATER)

    const result = await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', '1'],
        ['comment', 'Helpful.'],
      ]),
    )

    expect(result.error).toBe('You cannot rate other members.')
    expect(reputation.given).toEqual([])
  })

  it('closes the action when the board setting is off, not only the screen', async () => {
    settingsRef.current['reputation.enabled'] = false

    const result = await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', '1'],
        ['comment', 'Helpful.'],
      ]),
    )

    expect(result.error).toContain('switched off')
    expect(reputation.given).toEqual([])
  })

  it('honours the negative-ratings setting', async () => {
    settingsRef.current['reputation.allow_negative'] = false

    const result = await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', '-1'],
        ['comment', 'Unhelpful.'],
      ]),
    )

    expect(result.error).toContain('negative')
    expect(reputation.given).toEqual([])
  })

  it('honours the post floor, read from the profile counter', async () => {
    install(2)

    const result = await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', '1'],
        ['comment', 'Helpful.'],
      ]),
    )

    expect(result.error).toContain('at least 5 posts')
  })

  it('refuses a board with no reputation store rather than pretending', async () => {
    installTestContainer({ container: { reputation: null } })

    const result = await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', '1'],
        ['comment', 'Helpful.'],
      ]),
    )

    expect(result.error).toContain('sample data')
  })

  it('reports the daily cap when the write says it was reached', async () => {
    reputation.atCap = true

    const result = await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', '1'],
        ['comment', 'Helpful.'],
      ]),
    )

    expect(result.error).toContain('today')
  })

  it('refuses a missing rating rather than reading it as neutral', async () => {
    /*
     * `Number('')` is 0, which is a *valid* rating. Without the empty-string
     * guard a form posted with no value would silently record a neutral one.
     */
    const result = await run(
      rateMemberAction,
      form([
        ['userId', String(TARGET)],
        ['points', ''],
        ['comment', 'Helpful.'],
      ]),
    )

    expect(result.error).toBe('That is not a rating.')
    expect(reputation.given).toEqual([])
  })

  it('will not be turned into an open redirect', async () => {
    for (const bad of ['https://evil.test', '//evil.test']) {
      const result = await run(
        rateMemberAction,
        form([
          ['userId', String(TARGET)],
          ['points', '1'],
          ['comment', 'Helpful.'],
          ['returnTo', bad],
        ]),
      )
      expect(result.redirectedTo).toBe('/member/1?rated=1')
    }
  })
})

describe('withdrawing', () => {
  beforeEach(() => {
    reputation.rows = [
      {
        id: 7,
        userId: TARGET,
        givenByUserId: RATER,
        givenByUsername: 'bob',
        postId: null,
        threadId: null,
        points: 1,
        comment: 'x',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
  })

  it('removes the signed-in member’s own rating', async () => {
    const result = await run(
      withdrawRatingAction,
      form([
        ['ratingId', '7'],
        ['userId', String(TARGET)],
      ]),
    )

    expect(result.redirectedTo).toBe('/member/1/reputation?withdrawn=1')
    expect(reputation.rows).toEqual([])
  })

  it('leaves somebody else’s rating alone, and does not report a failure', async () => {
    /*
     * The scoping is in the repository's query. A second click, or an id that
     * was never yours, both match nothing — and reporting that as an error
     * would make a double submit look like a fault.
     */
    actorRef.current = await actorFor(SEED_GROUP.registered, 999)

    const result = await run(
      withdrawRatingAction,
      form([
        ['ratingId', '7'],
        ['userId', String(TARGET)],
      ]),
    )

    expect(result.error).toBeUndefined()
    expect(reputation.rows).toHaveLength(1)
  })
})
