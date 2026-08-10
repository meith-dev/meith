import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Authorizer,
  InMemoryAuthorizationSource,
  combinePermissionSets,
} from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import type {
  ModerationQueueRepository,
  PendingItem,
  QueuePage,
  QueueSelection,
} from '@meith/moderation'

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
const { SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import('./seed-board')

const { installTestContainer } = await import('./test-container')

class FakeQueue implements ModerationQueueRepository {
  readonly applied: Array<{ threadIds: readonly number[]; postIds: readonly number[] }> = []
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
  installTestContainer({ container: { moderationQueue: queue, ...overrides } })
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

  it('reports items in forums this actor does not moderate', async () => {
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
