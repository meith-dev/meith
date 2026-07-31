/**
 * F48 at the app layer.
 *
 * The queue's rules are unit-tested in `@forum/moderation` and its SQL against
 * real Postgres. What is proven here is the adapter tier neither can see: that
 * the set of moderated forums is resolved *server-side* for this request rather
 * than read from the form, that a member who moderates nothing is refused
 * however the form is crafted, and that the redirect reports what actually
 * happened.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Authorizer,
  InMemoryAuthorizationSource,
  combinePermissionSets,
} from '@forum/authorization'
import type { Actor } from '@forum/authorization'
import type {
  ModerationQueueRepository,
  PendingItem,
  QueuePage,
  QueueSelection,
} from '@forum/moderation'

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

const { moderateQueueAction } = await import('./moderation-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { FIXTURE_DATA_VERSION, SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import(
  './seed-board'
)

const CONTAINER_KEY = Symbol.for('@forum/forum.container')

class FakeQueue implements ModerationQueueRepository {
  readonly applied: Array<{ threadIds: readonly number[]; postIds: readonly number[] }> = []
  /** Every pending item lives in `announcements` unless a test moves it. */
  forumOf = (_item: QueueSelection): number => SEED_FORUM.announcements

  async list(): Promise<QueuePage> {
    return { items: [] }
  }

  async countPending(): Promise<number> {
    return 0
  }

  async resolve(selection: readonly QueueSelection[]): Promise<readonly PendingItem[]> {
    return selection.map((item) => ({ ...item, forumId: this.forumOf(item) }))
  }

  async apply(input: {
    threadIds: readonly number[]
    postIds: readonly number[]
  }): Promise<number> {
    this.applied.push(input)
    return input.threadIds.length + input.postIds.length
  }
}

let queue: FakeQueue

function installContainer(overrides: Record<string, unknown> = {}): void {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  ;(globalThis as Record<symbol, unknown>)[CONTAINER_KEY] = {
    authorizer: new Authorizer(source, {}),
    moderationQueue: queue,
    reports: null,
    threadTools: null,
    threadSurgery: null,
    inlineModeration: null,
    warnings: null,
    warningBans: null,
    threadWrites: null,
    postWrites: null,
    threads: {
      locateForum: async () => null,
      findById: async () => null,
      listForum: async () => ({ rows: [], nextCursor: null }),
    },
    posts: {
      findVisibleById: async () => null,
      listThread: async () => ({ rows: [], nextAfterId: null }),
    },
    readState: null,
    threadViews: null,
    memberProfiles: { findPublicById: async () => null },
    fixtureDataVersion: FIXTURE_DATA_VERSION,
    dataSource: 'fixture',
    ...overrides,
  }
}

function form(entries: Array<[string, string]>): FormData {
  const f = new FormData()
  for (const [k, v] of entries) f.append(k, v)
  return f
}

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

async function redirectOf(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (err) {
    if (err instanceof RedirectError) return err.location
    throw err
  }
  throw new Error('expected a redirect')
}

const SELECTION: Array<[string, string]> = [
  ['decision', 'approve'],
  ['item', 'thread:10'],
  ['item', 'post:20'],
]

beforeEach(async () => {
  queue = new FakeQueue()
  actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)
  installContainer()
})

describe('moderateQueueAction', () => {
  it('applies the decision and reports the counts', async () => {
    expect(await redirectOf(moderateQueueAction(EMPTY_STATE, form(SELECTION)))).toBe(
      '/moderation?did=approve&n=2',
    )
    expect(queue.applied[0]).toMatchObject({ threadIds: [10], postIds: [20] })
  })

  /*
   * The set of moderated forums is the authorisation, so it is resolved for
   * this request from the actor — never carried in the form, where it would be
   * the whole permission check sitting in the browser.
   */
  it('ignores a forum id supplied by the form', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    queue.forumOf = () => 4242

    const state = await moderateQueueAction(
      EMPTY_STATE,
      form([...SELECTION, ['forumIds', '4242']]),
    )

    expect(state.error).toMatch(/do not moderate/i)
    expect(queue.applied).toHaveLength(0)
  })

  it('refuses an ordinary member', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)

    const state = await moderateQueueAction(EMPTY_STATE, form(SELECTION))

    expect(state.error).toBeTruthy()
    expect(queue.applied).toHaveLength(0)
  })

  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const state = await moderateQueueAction(EMPTY_STATE, form(SELECTION))

    expect(state.error).toBeTruthy()
    expect(queue.applied).toHaveLength(0)
  })

  /*
   * A moderator of one forum acting on an item in another. The item's forum
   * comes from the database, so this is refused after the re-read rather than
   * before — and reported rather than silently dropped.
   */
  it('reports items in forums this actor does not moderate', async () => {
    /*
     * An *appointed* moderator, not a staff group — a super-moderator bypasses
     * forum permissions everywhere, so they are exactly the wrong actor for
     * this test. This is also the first time an appointment decides anything at
     * the app layer: `forum_moderators` had no reader before F48.
     */
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    queue.forumOf = (item) =>
      item.kind === 'thread' ? SEED_FORUM.announcements : SEED_FORUM.general

    installContainer({
      authorizer: new Authorizer(
        new InMemoryAuthorizationSource({
          ...SEED_BOARD,
          moderators: [
            {
              userId: 3,
              forumId: SEED_FORUM.announcements,
              cascadeToSubforums: false,
              canApproveContent: true,
              canEditPosts: false,
              canSoftDeletePosts: false,
              canRestorePosts: false,
              canOpenCloseThreads: false,
              canStickThreads: false,
              canMoveThreads: false,
              canMergeThreads: false,
              canSplitThreads: false,
            },
          ],
        }),
        {},
      ),
    })

    expect(await redirectOf(moderateQueueAction(EMPTY_STATE, form(SELECTION)))).toBe(
      '/moderation?did=approve&n=1&refused=1',
    )
    expect(queue.applied[0]).toMatchObject({ threadIds: [10], postIds: [] })
  })

  it('refuses a decision it does not recognise', async () => {
    const state = await moderateQueueAction(
      EMPTY_STATE,
      form([['decision', 'delete-everything'], ['item', 'thread:10']]),
    )

    expect(state.error).toBeTruthy()
    expect(queue.applied).toHaveLength(0)
  })

  it('refuses an empty selection', async () => {
    const state = await moderateQueueAction(EMPTY_STATE, form([['decision', 'approve']]))

    expect(state.error).toMatch(/select at least one/i)
    expect(queue.applied).toHaveLength(0)
  })

  it('drops a malformed checkbox value rather than guessing at it', async () => {
    const state = await moderateQueueAction(
      EMPTY_STATE,
      form([['decision', 'approve'], ['item', 'post:0'], ['item', 'user:5']]),
    )

    expect(state.error).toMatch(/select at least one/i)
    expect(queue.applied).toHaveLength(0)
  })
})
