import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  InMemoryAuthorizationSource,
  combinePermissionSets,
  type MemoryAppointment,
} from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import type {
  MergePlan,
  SplitPlan,
  SurgeryOutcome,
  SurgeryThread,
  ThreadSurgeryRepository,
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

const { mergeThreadAction, splitThreadAction, splitSelectedAction } = await import(
  './surgery-actions',
)
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import('./seed-board')

const { installTestContainer } = await import('./test-container')

const SOURCE = 20
const TARGET = 21

class FakeSurgery implements ThreadSurgeryRepository {
  readonly splits: SplitPlan[] = []
  readonly merges: MergePlan[] = []
  eligible: readonly number[] = [101, 102, 103]

  async find(threadId: number): Promise<SurgeryThread | null> {
    return {
      id: threadId,
      forumId: forumOf[threadId] ?? SEED_FORUM.general,
      slug: threadId === SOURCE ? 'hello' : 'other',
      title: 'Hello',
      visibility: 'visible',
      firstPostId: 100,
      visiblePosts: 4,
    }
  }

  async visiblePostIdsIn(
    _threadId: number,
    postIds: readonly number[],
  ): Promise<readonly number[]> {
    return this.eligible.filter((id) => postIds.includes(id))
  }

  async postsFrom(): Promise<readonly number[]> {
    return [102, 103]
  }

  async split(plan: SplitPlan & { actorUserId: number; at: Date }): Promise<SurgeryOutcome> {
    this.splits.push(plan)
    return { threadId: 99, slug: 'split-off', posts: plan.postIds.length }
  }

  async merge(plan: MergePlan & { actorUserId: number; at: Date }): Promise<SurgeryOutcome> {
    this.merges.push(plan)
    return { threadId: plan.targetThreadId, slug: 'other', posts: 2 }
  }
}

let forumOf: Record<number, number>
let authorOf: Record<number, number>
let surgery: FakeSurgery

function appointment(
  forumId: number,
  rights: Partial<MemoryAppointment>,
): MemoryAppointment {
  return {
    userId: 3,
    forumId,
    cascadeToSubforums: false,
    canApproveContent: false,
    canEditPosts: false,
    canSoftDeletePosts: false,
    canRestorePosts: false,
    canOpenCloseThreads: false,
    canStickThreads: false,
    canMoveThreads: false,
    canMergeThreads: false,
    canSplitThreads: false,
    ...rights,
  }
}

function installContainer(
  moderators: readonly MemoryAppointment[] = [],
  extraOverrides: (typeof SEED_BOARD)['overrides'] = [],
): void {
  installTestContainer({
    moderators,
    overrides: extraOverrides,
    container: {
      threadSurgery: surgery,
      threads: {
        locate: async (id: number) =>
          forumOf[id] === undefined
            ? null
            : { forumId: forumOf[id], authorUserId: authorOf[id] ?? null },
        findById: async () => null,
        listForum: async () => ({ rows: [], nextCursor: null }),
      },
    },
  })
}

function form(
  entries: Record<string, string>,
  items: readonly string[] = [],
): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  for (const item of items) f.append('item', item)
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

beforeEach(async () => {
  surgery = new FakeSurgery()
  forumOf = { [SOURCE]: SEED_FORUM.general, [TARGET]: SEED_FORUM.general }
  authorOf = { [SOURCE]: 7, [TARGET]: 7 }
  actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)
  installContainer()
})

describe('splitThreadAction', () => {
  it('splits and sends the moderator to the new thread', async () => {
    expect(
      await redirectOf(
        splitThreadAction(
          EMPTY_STATE,
          form({ threadId: String(SOURCE), fromPostId: '102', title: 'A new one' }),
        ),
      ),
    ).toBe('/thread/99-split-off?tool=split&n=2')
    expect(surgery.splits).toHaveLength(1)
    expect(surgery.splits[0]).toMatchObject({ sourceThreadId: SOURCE, title: 'A new one' })
  })

  it('refuses a guest and an ordinary member', async () => {
    for (const [group, id] of [
      [SEED_GROUP.guest, null],
      [SEED_GROUP.registered, 3],
    ] as const) {
      actorRef.current = await actorFor(group, id)
      const state = await splitThreadAction(
        EMPTY_STATE,
        form({ threadId: String(SOURCE), fromPostId: '102', title: 'A new one' }),
      )
      expect(state.error).toBeTruthy()
    }
    expect(surgery.splits).toEqual([])
  })

  it('needs the split right, and the merge right is not it', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_FORUM.general, { canMergeThreads: true })])

    const state = await splitThreadAction(
      EMPTY_STATE,
      form({ threadId: String(SOURCE), fromPostId: '102', title: 'A new one' }),
    )
    expect(state.error).toMatch(/cannot split/i)

    installContainer([appointment(SEED_FORUM.general, { canSplitThreads: true })])
    expect(
      await redirectOf(
        splitThreadAction(
          EMPTY_STATE,
          form({ threadId: String(SOURCE), fromPostId: '102', title: 'A new one' }),
        ),
      ),
    ).toMatch(/tool=split/)
  })

  it('rejects a missing or unreadable thread with the same answer', async () => {
    const state = await splitThreadAction(
      EMPTY_STATE,
      form({ threadId: '404', fromPostId: '102', title: 'A new one' }),
    )
    expect(state.error).toMatch(/does not exist/i)
    expect(surgery.splits).toEqual([])
  })

  it('asks for a cut point rather than guessing one', async () => {
    const state = await splitThreadAction(
      EMPTY_STATE,
      form({ threadId: String(SOURCE), title: 'A new one' }),
    )
    expect(state.error).toMatch(/choose the post/i)
    expect(surgery.splits).toEqual([])
  })
})

describe('mergeThreadAction', () => {
  it('merges and sends the moderator to the survivor', async () => {
    expect(
      await redirectOf(
        mergeThreadAction(
          EMPTY_STATE,
          form({ threadId: String(SOURCE), targetThreadId: String(TARGET) }),
        ),
      ),
    ).toBe(`/thread/${TARGET}-other?tool=merge&n=2`)
    expect(surgery.merges).toEqual([
      { sourceThreadId: SOURCE, targetThreadId: TARGET, actorUserId: 2, at: expect.any(Date) },
    ])
  })

  it('needs the merge right at both ends', async () => {
    forumOf[TARGET] = SEED_FORUM.announcements
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_FORUM.general, { canMergeThreads: true })])

    const state = await mergeThreadAction(
      EMPTY_STATE,
      form({ threadId: String(SOURCE), targetThreadId: String(TARGET) }),
    )
    expect(state.error).toMatch(/into that forum/i)
    expect(surgery.merges).toEqual([])

    installContainer([
      appointment(SEED_FORUM.general, { canMergeThreads: true }),
      appointment(SEED_FORUM.announcements, { canMergeThreads: true }),
    ])
    expect(
      await redirectOf(
        mergeThreadAction(
          EMPTY_STATE,
          form({ threadId: String(SOURCE), targetThreadId: String(TARGET) }),
        ),
      ),
    ).toMatch(/tool=merge/)
  })

  it('will not confirm that an unreadable thread exists', async () => {
    forumOf[TARGET] = SEED_FORUM.generalOffTopic
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer(
      [
        appointment(SEED_FORUM.general, { canMergeThreads: true }),
        appointment(SEED_FORUM.generalOffTopic, { canMergeThreads: true }),
      ],
      [
        {
          forumId: SEED_FORUM.generalOffTopic,
          groupId: SEED_GROUP.registered,
          overrides: { canView: false, canViewThreads: false },
        },
      ],
    )

    const state = await mergeThreadAction(
      EMPTY_STATE,
      form({ threadId: String(SOURCE), targetThreadId: String(TARGET) }),
    )
    expect(state.error).toMatch(/does not exist/i)
    expect(surgery.merges).toEqual([])
  })

  it('asks for a target rather than guessing one', async () => {
    const state = await mergeThreadAction(EMPTY_STATE, form({ threadId: String(SOURCE) }))
    expect(state.error).toMatch(/number of the thread/i)
    expect(surgery.merges).toEqual([])
  })

  it('refuses to merge a thread into itself', async () => {
    const state = await mergeThreadAction(
      EMPTY_STATE,
      form({ threadId: String(SOURCE), targetThreadId: String(SOURCE) }),
    )
    expect(state.error).toMatch(/into itself/i)
    expect(surgery.merges).toEqual([])
  })
})

describe('splitSelectedAction', () => {
  it('splits the ticked posts and lands on the new thread', async () => {
    const where = await redirectOf(
      splitSelectedAction(
        EMPTY_STATE,
        form({ threadId: String(SOURCE), title: 'A new conversation' }, [
          'post:101',
          'post:102',
        ]),
      ),
    )

    expect(where).toMatch(/^\/thread\/99-split-off\?tool=split&n=2/)
    expect(surgery.splits[0]).toMatchObject({ postIds: [101, 102] })
  })

  it('ignores a ticked thread in the same selection', async () => {
    await redirectOf(
      splitSelectedAction(
        EMPTY_STATE,
        form({ threadId: String(SOURCE), title: 'A new conversation' }, [
          'thread:20',
          'post:101',
        ]),
      ),
    )
    expect(surgery.splits[0]).toMatchObject({ postIds: [101] })
  })

  it('reports how many ticks it could not use', async () => {
    surgery.eligible = [101]
    const where = await redirectOf(
      splitSelectedAction(
        EMPTY_STATE,
        form({ threadId: String(SOURCE), title: 'A new conversation' }, [
          'post:101',
          'post:999',
        ]),
      ),
    )
    expect(where).toContain('dropped=1')
  })

  it('refuses a member with no split right', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer()

    const state = await splitSelectedAction(
      EMPTY_STATE,
      form({ threadId: String(SOURCE), title: 'A new conversation' }, ['post:101']),
    )
    expect(state.error).toBeTruthy()
    expect(surgery.splits).toEqual([])
  })

  it('refuses an empty selection rather than splitting nothing', async () => {
    const state = await splitSelectedAction(
      EMPTY_STATE,
      form({ threadId: String(SOURCE), title: 'A new conversation' }),
    )
    expect(state.error).toBeTruthy()
    expect(surgery.splits).toEqual([])
  })
})
