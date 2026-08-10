import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Authorizer,
  InMemoryAuthorizationSource,
  combinePermissionSets,
  type MemoryAppointment,
} from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import type { MoveDestination, ThreadToolTarget, ThreadToolsRepository } from '@meith/moderation'

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

const { threadToolAction } = await import('./thread-tool-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import('./seed-board')

const { installTestContainer, CONTAINER_KEY } = await import('./test-container')

class FakeTools implements ThreadToolsRepository {
  readonly calls: string[] = []
  forumId: number = SEED_FORUM.general

  async find(): Promise<ThreadToolTarget | null> {
    return {
      id: 20,
      forumId: this.forumId,
      slug: 'hello',
      title: 'Hello',
      isLocked: false,
      isSticky: false,
      visibility: 'visible',
    }
  }

  async findDestination(): Promise<MoveDestination | null> {
    return { id: SEED_FORUM.announcements, type: 'forum', allowThreads: true }
  }

  async setLocked(): Promise<boolean> {
    this.calls.push('setLocked')
    return true
  }

  async setSticky(): Promise<boolean> {
    this.calls.push('setSticky')
    return true
  }

  async setVisibility(): Promise<boolean> {
    this.calls.push('setVisibility')
    return true
  }

  async move(): Promise<boolean> {
    this.calls.push('move')
    return true
  }

  async copy(): Promise<{ threadId: number; slug: string; posts: number }> {
    this.calls.push('copy')
    return { threadId: 77, slug: 'hello', posts: 3 }
  }
}

let tools: FakeTools

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

function installContainer(moderators: readonly MemoryAppointment[] = []): void {
  installTestContainer({ moderators, container: { threadTools: tools } })
}

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
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
  tools = new FakeTools()
  actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)
  installContainer()
})

describe('threadToolAction', () => {
  it('locks and returns to the thread', async () => {
    expect(
      await redirectOf(threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'lock' }))),
    ).toBe('/thread/20-hello?tool=lock')
    expect(tools.calls).toEqual(['setLocked'])
  })

  it('refuses a guest and an ordinary member', async () => {
    for (const [group, id] of [
      [SEED_GROUP.guest, null],
      [SEED_GROUP.registered, 3],
    ] as const) {
      actorRef.current = await actorFor(group, id)
      const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'lock' }))
      expect(state.error).toBeTruthy()
    }
    expect(tools.calls).toEqual([])
  })

  it('honours a partial appointment', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_FORUM.general, { canOpenCloseThreads: true })])

    expect(
      await redirectOf(threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'lock' }))),
    ).toBe('/thread/20-hello?tool=lock')

    const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'stick' }))
    expect(state.error).toMatch(/cannot pin/i)
    expect(tools.calls).toEqual(['setLocked'])
  })

  it('needs the move right in the destination as well as the source', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_FORUM.general, { canMoveThreads: true })])

    const state = await threadToolAction(
      EMPTY_STATE,
      form({
        threadId: '20',
        tool: 'move',
        toForumId: String(SEED_FORUM.announcements),
      }),
    )
    expect(state.error).toMatch(/cannot move threads into/i)
    expect(tools.calls).toEqual([])

    installContainer([
      appointment(SEED_FORUM.general, { canMoveThreads: true }),
      appointment(SEED_FORUM.announcements, { canMoveThreads: true }),
    ])
    expect(
      await redirectOf(
        threadToolAction(
          EMPTY_STATE,
          form({
            threadId: '20',
            tool: 'move',
            toForumId: String(SEED_FORUM.announcements),
          }),
        ),
      ),
    ).toBe('/thread/20-hello?tool=move')
  })

  it('does not confirm a thread in a forum it cannot see', async () => {
    const hidden = 555
    tools.forumId = hidden
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    ;(globalThis as Record<symbol, unknown>)[CONTAINER_KEY] = undefined
    installContainer()
    const board = {
      ...SEED_BOARD,
      chains: { ...SEED_BOARD.chains, [hidden]: [hidden] },
      overrides: [
        ...SEED_BOARD.overrides,
        { forumId: hidden, groupId: SEED_GROUP.registered, overrides: { canView: false } },
      ],
    }
    ;(globalThis as Record<symbol, unknown>)[CONTAINER_KEY] = {
      ...((globalThis as Record<symbol, unknown>)[CONTAINER_KEY] as object),
      authorizer: new Authorizer(new InMemoryAuthorizationSource(board), {}),
    }

    const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'lock' }))

    expect(state.error).toBe('That thread does not exist.')
    expect(tools.calls).toEqual([])
  })

  it('refuses a tool it does not recognise', async () => {
    const state = await threadToolAction(
      EMPTY_STATE,
      form({ threadId: '20', tool: 'incinerate' }),
    )
    expect(state.error).toBeTruthy()
    expect(tools.calls).toEqual([])
  })
})

describe('copy', () => {
  it('needs the move right in the destination as well as the source', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_FORUM.general, { canMoveThreads: true })])

    const state = await threadToolAction(
      EMPTY_STATE,
      form({
        threadId: '20',
        tool: 'copy',
        toForumId: String(SEED_FORUM.announcements),
      }),
    )
    expect(state.error).toMatch(/cannot copy threads into/i)
    expect(tools.calls).toEqual([])
  })

  it('lands on the copy rather than on the source', async () => {
    expect(
      await redirectOf(
        threadToolAction(
          EMPTY_STATE,
          form({
            threadId: '20',
            tool: 'copy',
            toForumId: String(SEED_FORUM.announcements),
          }),
        ),
      ),
    ).toBe('/thread/77-hello?tool=copy')
    expect(tools.calls).toEqual(['copy'])
  })
})
