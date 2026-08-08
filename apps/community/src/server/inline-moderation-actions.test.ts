/**
 * F52 at the app layer.
 *
 * The rules are unit-tested in `@meith/moderation` and the counters against
 * real Postgres. What is proven here is the seam neither can see: that the
 * *scope* the selection is re-read inside is resolved from the actor for this
 * request, per tool, and that an id in a community the actor has no standing in is
 * indistinguishable from an id that does not exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  InMemoryAuthorizationSource,
  combinePermissionSets,
  type MemoryAppointment,
} from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import type {
  InlineModerationRepository,
  InlineTarget,
  InlineTool,
  MoveDestination,
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

const { inlineModerateAction } = await import('./inline-moderation-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_COMMUNITY, SEED_GROUP } = await import('./seed-board')

const { installTestContainer, CONTAINER_KEY } = await import('./test-container')

class FakeInline implements InlineModerationRepository {
  /** Every row the board contains, whatever the scope. */
  rows: InlineTarget[] = []
  destination: MoveDestination | null = { id: SEED_COMMUNITY.announcements, type: 'community' }
  readonly applied: Array<{ tool: InlineTool; threadIds: number[]; postIds: number[] }> = []
  /** What `resolve` was actually asked to look inside. */
  scopes: number[][] = []

  async resolve(
    selection: readonly QueueSelection[],
    communityIds: readonly number[],
  ): Promise<readonly InlineTarget[]> {
    this.scopes.push([...communityIds])
    const wanted = new Set(selection.map((s) => `${s.kind}:${s.id}`))
    return this.rows.filter(
      (row) => wanted.has(`${row.kind}:${row.id}`) && communityIds.includes(row.communityId),
    )
  }

  async findDestination(): Promise<MoveDestination | null> {
    return this.destination
  }

  async apply(input: {
    tool: InlineTool
    threadIds: readonly number[]
    postIds: readonly number[]
  }): Promise<number> {
    this.applied.push({
      tool: input.tool,
      threadIds: [...input.threadIds],
      postIds: [...input.postIds],
    })
    return input.threadIds.length + input.postIds.length
  }
}

let inline: FakeInline

function target(
  over: Partial<InlineTarget> & Pick<InlineTarget, 'kind' | 'id'>,
): InlineTarget {
  return {
    communityId: SEED_COMMUNITY.general,
    visibility: 'visible',
    threadVisibility: 'visible',
    isLocked: false,
    isSticky: false,
    ...over,
  }
}

function appointment(
  communityId: number,
  rights: Partial<MemoryAppointment>,
): MemoryAppointment {
  return {
    userId: 3,
    communityId,
    cascadeToSubcommunities: false,
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
  installTestContainer({ moderators, container: { inlineModeration: inline } })
}

/** Native checkboxes submit several values under one name. */
function form(fields: Record<string, string>, items: readonly string[] = []): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
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
  inline = new FakeInline()
  inline.rows = [
    target({ kind: 'thread', id: 20 }),
    target({ kind: 'thread', id: 21 }),
  ]
  actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)
  installContainer()
})

describe('inlineModerateAction', () => {
  it('applies the tool and reports the outcome in the query string', async () => {
    const where = await redirectOf(
      inlineModerateAction(
        EMPTY_STATE,
        form({ tool: 'lock', returnTo: '/2-general' }, ['thread:20', 'thread:21']),
      ),
    )

    expect(where).toBe('/2-general?did=lock&n=2')
    expect(inline.applied).toEqual([{ tool: 'lock', threadIds: [20, 21], postIds: [] }])
  })

  it('names every count that is not zero', async () => {
    inline.rows = [
      target({ kind: 'thread', id: 20, isLocked: true }),
      target({ kind: 'thread', id: 21 }),
    ]

    const where = await redirectOf(
      inlineModerateAction(
        EMPTY_STATE,
        form({ tool: 'lock', returnTo: '/2-general' }, [
          'thread:20',
          'thread:21',
          'thread:99',
        ]),
      ),
    )

    /* One locked, one already locked, one that does not exist. */
    expect(where).toBe('/2-general?did=lock&n=1&gone=1&skipped=1')
  })

  it('refuses a guest and an ordinary member', async () => {
    for (const [group, id] of [
      [SEED_GROUP.guest, null],
      [SEED_GROUP.registered, 3],
    ] as const) {
      actorRef.current = await actorFor(group, id)
      const state = await inlineModerateAction(
        EMPTY_STATE,
        form({ tool: 'lock' }, ['thread:20']),
      )
      expect(state.error).toBeTruthy()
    }
    expect(inline.applied).toEqual([])
  })

  it('refuses an empty selection rather than acting on nothing', async () => {
    const state = await inlineModerateAction(EMPTY_STATE, form({ tool: 'delete' }))
    expect(state.error).toMatch(/select at least one/i)
    expect(inline.applied).toEqual([])
  })

  it('refuses a tool it does not recognise', async () => {
    const state = await inlineModerateAction(
      EMPTY_STATE,
      form({ tool: 'incinerate' }, ['thread:20']),
    )
    expect(state.error).toBeTruthy()
    expect(inline.applied).toEqual([])
  })

  it('drops a malformed selection value rather than guessing at it', async () => {
    const where = await redirectOf(
      inlineModerateAction(
        EMPTY_STATE,
        form({ tool: 'lock', returnTo: '/2-general' }, [
          'thread:20',
          'thread:-1',
          'wombat:5',
          'thread:',
        ]),
      ),
    )
    expect(where).toBe('/2-general?did=lock&n=1')
    expect(inline.applied).toEqual([{ tool: 'lock', threadIds: [20], postIds: [] }])
  })

  /*
   * The scope is the authorisation, so it is resolved here rather than read out
   * of the form. A partial appointment must reach exactly one tool.
   */
  it('scopes the re-read to the communities this actor may use this tool in', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_COMMUNITY.general, { canOpenCloseThreads: true })])

    await redirectOf(
      inlineModerateAction(EMPTY_STATE, form({ tool: 'lock' }, ['thread:20'])),
    )
    expect(inline.scopes[0]).toEqual([SEED_COMMUNITY.general])

    const state = await inlineModerateAction(
      EMPTY_STATE,
      form({ tool: 'stick' }, ['thread:20']),
    )
    expect(state.error).toMatch(/cannot moderate/i)
    expect(inline.applied).toHaveLength(1)
  })

  /*
   * The disclosure property, end to end. A thread in a community this actor has no
   * standing in must produce the *same* answer as a thread that never existed —
   * otherwise the counts enumerate the board.
   */
  it('reports a thread outside the scope exactly as it reports one that does not exist', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_COMMUNITY.general, { canOpenCloseThreads: true })])
    inline.rows = [target({ kind: 'thread', id: 20, communityId: SEED_COMMUNITY.announcements })]

    const elsewhere = await redirectOf(
      inlineModerateAction(
        EMPTY_STATE,
        form({ tool: 'lock', returnTo: '/2-general' }, ['thread:20']),
      ),
    )

    inline.rows = []
    const nowhere = await redirectOf(
      inlineModerateAction(
        EMPTY_STATE,
        form({ tool: 'lock', returnTo: '/2-general' }, ['thread:20']),
      ),
    )

    expect(elsewhere).toBe(nowhere)
    expect(elsewhere).toBe('/2-general?did=lock&n=0&gone=1')
  })

  /*
   * Deleting is scoped by the union of the two actions that can authorise it,
   * because a thread and a post are different grants — see INLINE_TOOL_ACTIONS.
   */
  it('lets an appointee delete a post in their community', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_COMMUNITY.general, { canSoftDeletePosts: true })])
    inline.rows = [target({ kind: 'post', id: 7 })]

    const where = await redirectOf(
      inlineModerateAction(
        EMPTY_STATE,
        form({ tool: 'delete', returnTo: '/thread/20-hello' }, ['post:7']),
      ),
    )
    expect(where).toBe('/thread/20-hello?did=delete&n=1')
    expect(inline.applied).toEqual([{ tool: 'delete', threadIds: [], postIds: [7] }])
  })

  it('needs the move right in the destination as well as the source', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_COMMUNITY.general, { canMoveThreads: true })])

    const state = await inlineModerateAction(
      EMPTY_STATE,
      form({ tool: 'move', toCommunityId: String(SEED_COMMUNITY.announcements) }, ['thread:20']),
    )
    expect(state.error).toMatch(/cannot move threads into/i)
    expect(inline.applied).toEqual([])

    installContainer([
      appointment(SEED_COMMUNITY.general, { canMoveThreads: true }),
      appointment(SEED_COMMUNITY.announcements, { canMoveThreads: true }),
    ])
    await redirectOf(
      inlineModerateAction(
        EMPTY_STATE,
        form({ tool: 'move', toCommunityId: String(SEED_COMMUNITY.announcements) }, ['thread:20']),
      ),
    )
    expect(inline.applied).toEqual([{ tool: 'move', threadIds: [20], postIds: [] }])
  })

  describe('the return path', () => {
    it('falls back to the board root when none was given', async () => {
      expect(
        await redirectOf(
          inlineModerateAction(EMPTY_STATE, form({ tool: 'lock' }, ['thread:20'])),
        ),
      ).toBe('/?did=lock&n=1')
    })

    /* A field that decides where the browser lands is an open redirect. */
    it('refuses an off-board target', async () => {
      for (const evil of ['//evil.test/x', 'https://evil.test/x', 'javascript:alert(1)']) {
        expect(
          await redirectOf(
            inlineModerateAction(
              EMPTY_STATE,
              form({ tool: 'lock', returnTo: evil }, ['thread:20']),
            ),
          ),
        ).toBe('/?did=lock&n=1')
      }
    })

    it('appends to a path that already carries a query', async () => {
      expect(
        await redirectOf(
          inlineModerateAction(
            EMPTY_STATE,
            form({ tool: 'lock', returnTo: '/2-general?page=2' }, ['thread:20']),
          ),
        ),
      ).toBe('/2-general?page=2&did=lock&n=1')
    })
  })

  it('says so plainly when the board has no moderation storage at all', async () => {
    ;(globalThis as Record<symbol, unknown>)[CONTAINER_KEY] = {
      ...((globalThis as Record<symbol, unknown>)[CONTAINER_KEY] as object),
      inlineModeration: null,
    }
    const state = await inlineModerateAction(
      EMPTY_STATE,
      form({ tool: 'lock' }, ['thread:20']),
    )
    expect(state.error).toMatch(/sample data/i)
  })
})
