import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@meith/authorization'
import {
  Authorizer,
  combinePermissionSets,
  InMemoryAuthorizationSource,
} from '@meith/authorization'
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

const adminCalls: Array<{ action: string; detail: unknown }> = []
vi.mock('./admin', () => ({
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const avatarLocks: Array<{ userId: number; locked: boolean; reason: string }> = []
const avatarServiceRef: { current: unknown } = { current: null }
vi.mock('./avatars', () => ({ avatarService: () => avatarServiceRef.current }))

const { moderateQueueAction, setAvatarLockAction, setSignatureLockAction } = await import(
  './moderation-actions'
)
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

const signatureLocks: Array<{ userId: number; locked: boolean; reason: string | null }> = []

async function warnerActor(userId: number): Promise<Actor> {
  const actor = await actorFor(SEED_GROUP.superModerators, userId)
  return { ...actor, global: { ...actor.global, canWarnUsers: true } }
}

beforeEach(async () => {
  queue = new FakeQueue()
  actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)
  adminCalls.length = 0
  signatureLocks.length = 0
  avatarLocks.length = 0
  avatarServiceRef.current = {
    setLock: async (input: { userId: number; locked: boolean; reason: string }) => {
      avatarLocks.push(input)
    },
  }
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

    const state = await moderateQueueAction(EMPTY_STATE, form([...SELECTION, ['forumIds', '4242']]))

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
      form([
        ['decision', 'delete-everything'],
        ['item', 'thread:10'],
      ]),
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
      form([
        ['decision', 'approve'],
        ['item', 'post:0'],
        ['item', 'user:5'],
      ]),
    )

    expect(state.error).toMatch(/select at least one/i)
    expect(queue.applied).toHaveLength(0)
  })
})

describe('locking what a member displays', () => {
  beforeEach(async () => {
    actorRef.current = await warnerActor(2)
    installContainer({
      signatures: {
        setLocked: async (input: { userId: number; locked: boolean; reason: string | null }) => {
          signatureLocks.push(input)
        },
      },
    })
  })

  it('records a signature lock against the member it was applied to', async () => {
    await redirectOf(
      setSignatureLockAction(
        EMPTY_STATE,
        form([
          ['userId', '7'],
          ['locked', '1'],
          ['reason', 'advertising'],
        ]),
      ),
    )

    expect(signatureLocks[0]).toMatchObject({ userId: 7, locked: true })
    expect(adminCalls).toEqual([{ action: 'signature.lock', detail: { userId: 7 } }])
  })

  it('records the release as its own action, not as the lock again', async () => {
    await redirectOf(
      setSignatureLockAction(
        EMPTY_STATE,
        form([
          ['userId', '7'],
          ['locked', '0'],
        ]),
      ),
    )

    expect(adminCalls).toEqual([{ action: 'signature.unlock', detail: { userId: 7 } }])
  })

  it('records an avatar lock and its release the same way', async () => {
    await redirectOf(
      setAvatarLockAction(
        EMPTY_STATE,
        form([
          ['userId', '7'],
          ['locked', '1'],
          ['reason', 'obscene'],
        ]),
      ),
    )
    await redirectOf(
      setAvatarLockAction(
        EMPTY_STATE,
        form([
          ['userId', '7'],
          ['locked', '0'],
        ]),
      ),
    )

    expect(avatarLocks).toHaveLength(2)
    expect(adminCalls.map((call) => call.action)).toEqual(['avatar.lock', 'avatar.unlock'])
  })

  it('keeps the reason the member is shown out of the log', async () => {
    await redirectOf(
      setSignatureLockAction(
        EMPTY_STATE,
        form([
          ['userId', '7'],
          ['locked', '1'],
          ['reason', 'advertising a rival board'],
        ]),
      ),
    )

    expect(JSON.stringify(adminCalls)).not.toContain('rival board')
  })

  it('logs nothing when the lock was refused', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)

    const state = await setSignatureLockAction(
      EMPTY_STATE,
      form([
        ['userId', '7'],
        ['locked', '1'],
        ['reason', 'advertising'],
      ]),
    )

    expect(state.error).toBeTruthy()
    expect(signatureLocks).toEqual([])
    expect(adminCalls).toEqual([])
  })

  it('logs nothing when the lock was rejected for having no reason', async () => {
    const state = await setSignatureLockAction(
      EMPTY_STATE,
      form([
        ['userId', '7'],
        ['locked', '1'],
      ]),
    )

    expect(state.error).toMatch(/say why/i)
    expect(adminCalls).toEqual([])
  })
})
