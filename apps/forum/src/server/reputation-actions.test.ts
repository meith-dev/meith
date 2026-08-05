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

const { rateMemberAction, thankForPostAction, withdrawRatingAction } = await import(
  './reputation-actions'
)
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
  /** What this rater holds on this target, out of the rows the test set up. */
  async existing(input: { givenByUserId: number; userId: number; postId: number | null }) {
    return (
      this.rows.find(
        (row) =>
          row.givenByUserId === input.givenByUserId &&
          row.userId === input.userId &&
          row.postId === input.postId,
      ) ?? null
    )
  }
  async existingForPosts(input: { givenByUserId: number; postIds: readonly number[] }) {
    return new Map(
      this.rows
        .filter((row) => row.givenByUserId === input.givenByUserId && row.postId !== null)
        .filter((row) => input.postIds.includes(row.postId as number))
        .map((row) => [row.postId as number, row] as const),
    )
  }
  async thanksForPosts(postIds: readonly number[]) {
    const counts = new Map<number, number>()
    for (const row of this.rows) {
      if (row.postId === null || row.points <= 0 || !postIds.includes(row.postId)) continue
      counts.set(row.postId, (counts.get(row.postId) ?? 0) + 1)
    }
    return counts
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

/**
 * The Thanks button's action.
 *
 * What is worth pinning here is not "does it write +1" — the service's own
 * tests cover the rules, and this action reaches them through the same door
 * `rateMemberAction` does. It is the three decisions this action makes on its
 * own, because a one-click control has nowhere to put an explanation:
 *
 *  - it **toggles**, from the rating this member actually holds rather than
 *    from anything the form claims;
 *  - it toggles off **only a positive** rating, so a considered negative left
 *    on the profile screen is not lost to a stray press;
 *  - it comes back to **the post**, not the top of a long thread.
 */
describe('thankForPostAction', () => {
  /*
   * The board this control ships on. The file's own `beforeEach` requires a
   * comment — which is a fine default for the *form* and the one configuration
   * under which this button is deliberately not offered at all, so every test
   * below except the refusal starts from the other one.
   */
  beforeEach(() => {
    settingsRef.current['reputation.comment_required'] = false
  })

  function thank(postId = 10): Promise<{ redirectedTo?: string; error?: string }> {
    return run(
      thankForPostAction,
      form([
        ['userId', String(TARGET)],
        ['postId', String(postId)],
        ['returnTo', '/thread/4-hello'],
      ]),
    )
  }

  function row(overrides: Partial<ReputationRow> = {}): ReputationRow {
    return {
      id: 7,
      userId: TARGET,
      givenByUserId: RATER,
      givenByUsername: 'user2',
      postId: 10,
      threadId: 4,
      points: 1,
      comment: '',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-01T00:00:00Z'),
      ...overrides,
    }
  }

  it('gives a positive rating with no comment, attached to the post', async () => {
    const result = await thank()

    expect(result.error).toBeUndefined()
    expect(reputation.given).toEqual([
      { userId: TARGET, givenByUserId: RATER, points: 1, postId: 10 },
    ])
  })

  /*
   * A comment requirement is the one rule a single press cannot satisfy. The
   * thread page hides the button rather than offering a refusal — but the
   * action is a URL, so the refusal has to be real as well as hidden.
   */
  it('is refused when the board requires a comment', async () => {
    settingsRef.current['reputation.comment_required'] = true

    const result = await thank()

    expect(result.error).toMatch(/Say why/)
    expect(reputation.given).toHaveLength(0)
  })

  /*
   * The toggle. Without it a second press writes +1 over +1 and appears to do
   * nothing at all, which is the failure nobody reports.
   */
  it('takes the thanks back when it is already there', async () => {
    reputation.rows = [row()]

    const result = await thank()

    expect(result.error).toBeUndefined()
    expect(reputation.rows).toHaveLength(0)
    expect(reputation.given).toHaveLength(0)
  })

  /*
   * Somebody who left a considered negative rating with a reason should not
   * lose it to a stray press of Thanks. That rating is not what this control
   * gave, so it is not this control's to remove — pressing turns it into a
   * thanks instead, which is a change they can see and undo.
   */
  it('does not withdraw a negative rating; it replaces it', async () => {
    reputation.rows = [row({ points: -1, comment: 'Wrong, and rudely.' })]

    await thank()

    expect(reputation.rows).toHaveLength(1)
    expect(reputation.given).toEqual([
      { userId: TARGET, givenByUserId: RATER, points: 1, postId: 10 },
    ])
  })

  /*
   * A rating this member holds on a *different* post is not this button's.
   * Keyed on the post, or one thanks would toggle another off.
   */
  it('is scoped to the post it was pressed on', async () => {
    reputation.rows = [row({ postId: 11 })]

    await thank(10)

    expect(reputation.rows).toHaveLength(1)
    expect(reputation.given).toHaveLength(1)
  })

  /*
   * Back to the post. A reader who thanks #47 on a long page and lands on #1
   * has lost their place — the whole cost of a control that works without
   * JavaScript, and the whole of the fix.
   */
  it('returns the reader to the post, not the top of the thread', async () => {
    expect((await thank()).redirectedTo).toBe('/thread/4-hello#post-10')
  })

  /* The same open-redirect rule every `returnTo` on this board follows. */
  it('refuses an off-site returnTo', async () => {
    const result = await run(
      thankForPostAction,
      form([
        ['userId', String(TARGET)],
        ['postId', '10'],
        ['returnTo', '//evil.test/'],
      ]),
    )

    expect(result.redirectedTo).toBe(`/member/${TARGET}#post-10`)
  })

  /* The rater is the session's member. A guest has none, so there is no write. */
  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    expect((await thank()).error).toMatch(/logged in/)
    expect(reputation.given).toHaveLength(0)
  })

  /* Switching reputation off closes the action, not only the screen. */
  it('is refused when the board has reputation switched off', async () => {
    settingsRef.current['reputation.enabled'] = false

    expect((await thank()).error).toMatch(/switched off/)
    expect(reputation.given).toHaveLength(0)
  })
})
