/** F52 — the inline-moderation rules, without a database. */
import { describe, expect, it } from 'vitest'
import { ValidationError } from '@forum/core'

import {
  INLINE_CHUNK,
  INLINE_TOOL_ACTIONS,
  InlineModeration,
  MAX_INLINE_SELECTION,
  NO_INLINE_RIGHTS,
  parseInlineTool,
  type InlineModerationRepository,
  type InlineRights,
  type InlineTarget,
  type InlineTool,
} from './inline'
import type { MoveDestination } from './thread-tools'
import type { QueueSelection } from './queue'

const NOW = new Date('2026-07-31T12:00:00Z')

const ALL: InlineRights = {
  approve: true,
  lock: true,
  stick: true,
  move: true,
  deleteThreads: true,
  deletePosts: true,
}

/** Where the actor may act. Anything outside it must be invisible, not refused. */
const SCOPE = [4, 5]

function target(over: Partial<InlineTarget> & Pick<InlineTarget, 'kind' | 'id'>): InlineTarget {
  return {
    forumId: 4,
    visibility: 'visible',
    threadVisibility: 'visible',
    isLocked: false,
    isSticky: false,
    ...over,
  }
}

class FakeInline implements InlineModerationRepository {
  rows: InlineTarget[] = []
  destination: MoveDestination | null = { id: 5, type: 'forum' }
  /** Every chunk this repository was handed, in order. */
  readonly chunks: Array<{ tool: InlineTool; threadIds: number[]; postIds: number[] }> = []
  /** Ids the write is to report as having lost a race. */
  raced = new Set<number>()

  async resolve(
    selection: readonly QueueSelection[],
    forumIds: readonly number[],
  ): Promise<readonly InlineTarget[]> {
    const wanted = new Set(selection.map((s) => `${s.kind}:${s.id}`))
    return this.rows.filter(
      (row) => wanted.has(`${row.kind}:${row.id}`) && forumIds.includes(row.forumId),
    )
  }

  async findDestination(): Promise<MoveDestination | null> {
    return this.destination
  }

  async apply(input: {
    tool: InlineTool
    threadIds: readonly number[]
    postIds: readonly number[]
    toForumId?: number | undefined
    actorUserId: number
    at: Date
  }): Promise<number> {
    this.chunks.push({
      tool: input.tool,
      threadIds: [...input.threadIds],
      postIds: [...input.postIds],
    })
    return [...input.threadIds, ...input.postIds].filter((id) => !this.raced.has(id)).length
  }
}

function commandFor(inline: FakeInline): InlineModeration {
  return new InlineModeration({ inline, now: () => NOW })
}

/** A rights resolver that answers the same thing everywhere. */
function everywhere(rights: InlineRights): {
  rightsIn: (forumId: number) => Promise<InlineRights>
  asked: number[]
} {
  const asked: number[] = []
  return {
    asked,
    rightsIn: async (forumId: number) => {
      asked.push(forumId)
      return rights
    },
  }
}

function ids(kind: 'thread' | 'post', values: readonly number[]): QueueSelection[] {
  return values.map((id) => ({ kind, id }))
}

describe('InlineModeration', () => {
  it('applies a tool to everything selected that is in a state to receive it', async () => {
    const inline = new FakeInline()
    inline.rows = [
      target({ kind: 'thread', id: 1 }),
      target({ kind: 'thread', id: 2 }),
      target({ kind: 'thread', id: 3 }),
    ]

    const outcome = await commandFor(inline).apply({
      selection: ids('thread', [1, 2, 3]),
      tool: 'lock',
      scopeForumIds: SCOPE,
      rights: everywhere(ALL),
      actorUserId: 9,
    })

    expect(outcome).toEqual({
      tool: 'lock',
      applied: 3,
      refused: 0,
      missing: 0,
      skipped: 0,
    })
    expect(inline.chunks).toEqual([{ tool: 'lock', threadIds: [1, 2, 3], postIds: [] }])
  })

  it('deduplicates the selection so one row is never counted twice', async () => {
    const inline = new FakeInline()
    inline.rows = [target({ kind: 'thread', id: 1 })]

    const outcome = await commandFor(inline).apply({
      selection: ids('thread', [1, 1, 1]),
      tool: 'lock',
      scopeForumIds: SCOPE,
      rights: everywhere(ALL),
      actorUserId: 9,
    })

    expect(outcome.applied).toBe(1)
    expect(outcome.missing).toBe(0)
    expect(inline.chunks[0]!.threadIds).toEqual([1])
  })

  /*
   * The security property. A row outside the scope is not "refused", because
   * that would be an answer, and the difference between an answer and no answer
   * is a content-existence oracle over every private forum on the board.
   */
  it('reports a row outside the scope as missing, exactly like one that does not exist', async () => {
    const inline = new FakeInline()
    inline.rows = [
      target({ kind: 'thread', id: 1, forumId: 4 }),
      target({ kind: 'thread', id: 2, forumId: 99 }),
    ]

    const outcome = await commandFor(inline).apply({
      selection: ids('thread', [1, 2, 3]),
      tool: 'lock',
      scopeForumIds: SCOPE,
      rights: everywhere(ALL),
      actorUserId: 9,
    })

    // #2 is in a forum out of scope, #3 does not exist: one number, both cases.
    expect(outcome).toMatchObject({ applied: 1, refused: 0, missing: 2 })
  })

  it('returns everything as missing, and touches nothing, when the scope is empty', async () => {
    const inline = new FakeInline()
    inline.rows = [target({ kind: 'thread', id: 1 })]

    const outcome = await commandFor(inline).apply({
      selection: ids('thread', [1]),
      tool: 'delete',
      scopeForumIds: [],
      rights: everywhere(ALL),
      actorUserId: 9,
    })

    expect(outcome).toMatchObject({ applied: 0, missing: 1 })
    expect(inline.chunks).toEqual([])
  })

  /*
   * Rights are checked before state, so somebody who may not act here cannot
   * learn from `skipped` that the thread is already locked.
   */
  it('refuses a row it holds no right for without revealing its state', async () => {
    const inline = new FakeInline()
    inline.rows = [target({ kind: 'thread', id: 1, isLocked: true })]

    const outcome = await commandFor(inline).apply({
      selection: ids('thread', [1]),
      tool: 'lock',
      scopeForumIds: SCOPE,
      rights: everywhere({ ...NO_INLINE_RIGHTS, approve: true }),
      actorUserId: 9,
    })

    expect(outcome).toMatchObject({ applied: 0, refused: 1, skipped: 0 })
  })

  it('separates thread deletion from post deletion, which are different grants', async () => {
    const inline = new FakeInline()
    inline.rows = [
      target({ kind: 'thread', id: 1 }),
      target({ kind: 'post', id: 7 }),
    ]

    const outcome = await commandFor(inline).apply({
      selection: [...ids('thread', [1]), ...ids('post', [7])],
      tool: 'delete',
      scopeForumIds: SCOPE,
      rights: everywhere({ ...NO_INLINE_RIGHTS, deletePosts: true }),
      actorUserId: 9,
    })

    expect(outcome).toMatchObject({ applied: 1, refused: 1 })
    expect(inline.chunks).toEqual([{ tool: 'delete', threadIds: [], postIds: [7] }])
  })

  it('resolves rights once per forum, not once per row', async () => {
    const inline = new FakeInline()
    inline.rows = [
      target({ kind: 'thread', id: 1, forumId: 4 }),
      target({ kind: 'thread', id: 2, forumId: 4 }),
      target({ kind: 'thread', id: 3, forumId: 5 }),
    ]
    const rights = everywhere(ALL)

    await commandFor(inline).apply({
      selection: ids('thread', [1, 2, 3]),
      tool: 'lock',
      scopeForumIds: SCOPE,
      rights,
      actorUserId: 9,
    })

    expect(rights.asked).toEqual([4, 5])
  })

  describe('state preconditions', () => {
    const cases: ReadonlyArray<[InlineTool, Partial<InlineTarget>, boolean]> = [
      ['approve', { visibility: 'unapproved', threadVisibility: 'unapproved' }, true],
      ['approve', { visibility: 'visible' }, false],
      ['delete', { visibility: 'visible' }, true],
      ['delete', { visibility: 'deleted' }, false],
      ['restore', { visibility: 'deleted' }, true],
      ['restore', { visibility: 'unapproved' }, false],
      ['lock', { isLocked: false }, true],
      ['lock', { isLocked: true }, false],
      ['unlock', { isLocked: true }, true],
      ['stick', { isSticky: false }, true],
      ['unstick', { isSticky: false }, false],
      /* A deleted thread's pin would sort a listing by a flag nobody can see. */
      ['stick', { visibility: 'deleted' }, false],
    ]

    for (const [tool, state, expected] of cases) {
      it(`${tool} ${expected ? 'applies to' : 'skips'} ${JSON.stringify(state)}`, async () => {
        const inline = new FakeInline()
        inline.rows = [target({ kind: 'thread', id: 1, ...state })]

        const outcome = await commandFor(inline).apply({
          selection: ids('thread', [1]),
          tool,
          scopeForumIds: SCOPE,
          rights: everywhere(ALL),
          actorUserId: 9,
          ...(tool === 'move' ? { toForumId: 5 } : {}),
        })

        expect(outcome.applied).toBe(expected ? 1 : 0)
        expect(outcome.skipped).toBe(expected ? 0 : 1)
      })
    }

    /*
     * F48's rule seen from the other surface: approving a reply held inside a
     * held thread would publish a post into a thread nobody can see.
     */
    it('will not approve a held reply whose thread is itself held', async () => {
      const inline = new FakeInline()
      inline.rows = [
        target({
          kind: 'post',
          id: 7,
          visibility: 'unapproved',
          threadVisibility: 'unapproved',
        }),
      ]

      const outcome = await commandFor(inline).apply({
        selection: ids('post', [7]),
        tool: 'approve',
        scopeForumIds: SCOPE,
        rights: everywhere(ALL),
        actorUserId: 9,
      })

      expect(outcome).toMatchObject({ applied: 0, skipped: 1 })
    })

    it('approves a thread that is itself held', async () => {
      const inline = new FakeInline()
      inline.rows = [
        target({
          kind: 'thread',
          id: 1,
          visibility: 'unapproved',
          threadVisibility: 'unapproved',
        }),
      ]

      const outcome = await commandFor(inline).apply({
        selection: ids('thread', [1]),
        tool: 'approve',
        scopeForumIds: SCOPE,
        rights: everywhere(ALL),
        actorUserId: 9,
      })

      expect(outcome.applied).toBe(1)
    })

    it('skips a post ticked next to a thread-only tool rather than failing the batch', async () => {
      const inline = new FakeInline()
      inline.rows = [
        target({ kind: 'thread', id: 1 }),
        target({ kind: 'post', id: 7 }),
      ]

      const outcome = await commandFor(inline).apply({
        selection: [...ids('thread', [1]), ...ids('post', [7])],
        tool: 'stick',
        scopeForumIds: SCOPE,
        rights: everywhere(ALL),
        actorUserId: 9,
      })

      expect(outcome).toMatchObject({ applied: 1, skipped: 1, refused: 0 })
    })
  })

  describe('move', () => {
    it('needs the right at the destination as well as the source', async () => {
      const inline = new FakeInline()
      inline.rows = [target({ kind: 'thread', id: 1, forumId: 4 })]

      /* Everywhere-move except forum 5, which is where they are aiming. */
      const rights = {
        rightsIn: async (forumId: number) =>
          forumId === 5 ? { ...ALL, move: false } : ALL,
      }

      await expect(
        commandFor(inline).apply({
          selection: ids('thread', [1]),
          tool: 'move',
          toForumId: 5,
          scopeForumIds: SCOPE,
          rights,
          actorUserId: 9,
        }),
      ).rejects.toBeInstanceOf(ValidationError)
      expect(inline.chunks).toEqual([])
    })

    it('refuses a destination that is not a forum threads can live in', async () => {
      const inline = new FakeInline()
      inline.rows = [target({ kind: 'thread', id: 1 })]
      inline.destination = { id: 5, type: 'category' }

      await expect(
        commandFor(inline).apply({
          selection: ids('thread', [1]),
          tool: 'move',
          toForumId: 5,
          scopeForumIds: SCOPE,
          rights: everywhere(ALL),
          actorUserId: 9,
        }),
      ).rejects.toBeInstanceOf(ValidationError)
    })

    it('refuses a move with no destination at all', async () => {
      const inline = new FakeInline()
      inline.rows = [target({ kind: 'thread', id: 1 })]

      await expect(
        commandFor(inline).apply({
          selection: ids('thread', [1]),
          tool: 'move',
          scopeForumIds: SCOPE,
          rights: everywhere(ALL),
          actorUserId: 9,
        }),
      ).rejects.toBeInstanceOf(ValidationError)
    })

    it('skips a thread already in the destination', async () => {
      const inline = new FakeInline()
      inline.rows = [
        target({ kind: 'thread', id: 1, forumId: 5 }),
        target({ kind: 'thread', id: 2, forumId: 4 }),
      ]

      const outcome = await commandFor(inline).apply({
        selection: ids('thread', [1, 2]),
        tool: 'move',
        toForumId: 5,
        scopeForumIds: SCOPE,
        rights: everywhere(ALL),
        actorUserId: 9,
      })

      expect(outcome).toMatchObject({ applied: 1, skipped: 1 })
      expect(inline.chunks).toEqual([{ tool: 'move', threadIds: [2], postIds: [] }])
    })
  })

  describe('chunking', () => {
    it('splits a large selection into bounded transactions', async () => {
      const inline = new FakeInline()
      const count = INLINE_CHUNK * 3 + 4
      const selected = Array.from({ length: count }, (_, i) => i + 1)
      inline.rows = selected.map((id) => target({ kind: 'thread', id }))

      const outcome = await commandFor(inline).apply({
        selection: ids('thread', selected),
        tool: 'delete',
        scopeForumIds: SCOPE,
        rights: everywhere(ALL),
        actorUserId: 9,
      })

      expect(outcome.applied).toBe(count)
      expect(inline.chunks).toHaveLength(4)
      expect(inline.chunks.map((c) => c.threadIds.length)).toEqual([
        INLINE_CHUNK,
        INLINE_CHUNK,
        INLINE_CHUNK,
        4,
      ])
    })

    /*
     * The chunk boundary is the point of the feature: F48 refuses over 200, and
     * a listing with a "select all" has to do the work instead.
     */
    it('handles a selection well over the queue ceiling', async () => {
      const inline = new FakeInline()
      const selected = Array.from({ length: 220 }, (_, i) => i + 1)
      inline.rows = selected.map((id) => target({ kind: 'thread', id }))

      const outcome = await commandFor(inline).apply({
        selection: ids('thread', selected),
        tool: 'delete',
        scopeForumIds: SCOPE,
        rights: everywhere(ALL),
        actorUserId: 9,
      })

      expect(outcome.applied).toBe(220)
    })

    it('still bounds one request', async () => {
      const inline = new FakeInline()
      const selected = Array.from({ length: MAX_INLINE_SELECTION + 1 }, (_, i) => i + 1)

      await expect(
        commandFor(inline).apply({
          selection: ids('thread', selected),
          tool: 'delete',
          scopeForumIds: SCOPE,
          rights: everywhere(ALL),
          actorUserId: 9,
        }),
      ).rejects.toBeInstanceOf(ValidationError)
    })

    it('refuses an empty selection', async () => {
      const inline = new FakeInline()
      await expect(
        commandFor(inline).apply({
          selection: [],
          tool: 'delete',
          scopeForumIds: SCOPE,
          rights: everywhere(ALL),
          actorUserId: 9,
        }),
      ).rejects.toBeInstanceOf(ValidationError)
    })
  })

  /*
   * A row that passed every check and did not move lost a race with another
   * moderator. It is a skip: the state it was being moved to is the state it is
   * in, and reporting it as applied would be a lie about what this actor did.
   */
  it('counts a row that lost a race between the re-read and the write as skipped', async () => {
    const inline = new FakeInline()
    inline.rows = [
      target({ kind: 'thread', id: 1 }),
      target({ kind: 'thread', id: 2 }),
    ]
    inline.raced = new Set([2])

    const outcome = await commandFor(inline).apply({
      selection: ids('thread', [1, 2]),
      tool: 'delete',
      scopeForumIds: SCOPE,
      rights: everywhere(ALL),
      actorUserId: 9,
    })

    expect(outcome).toMatchObject({ applied: 1, skipped: 1 })
  })
})

describe('parseInlineTool', () => {
  it('accepts every tool and nothing else', () => {
    for (const tool of Object.keys(INLINE_TOOL_ACTIONS)) {
      expect(parseInlineTool(tool)).toBe(tool)
    }
    expect(parseInlineTool('reject')).toBeNull()
    expect(parseInlineTool('DELETE')).toBeNull()
    expect(parseInlineTool(undefined)).toBeNull()
  })
})

describe('INLINE_TOOL_ACTIONS', () => {
  /*
   * Deleting is the case that forces the scope to be a union: a thread needs
   * `thread.delete` (appointment only) and a post needs `post.softDelete`
   * (which a usergroup can grant). One action for both breaks one of them.
   */
  it('scopes deletion by both the thread and the post action', () => {
    expect(INLINE_TOOL_ACTIONS.delete).toEqual(['thread.delete', 'post.softDelete'])
    expect(INLINE_TOOL_ACTIONS.restore).toEqual(['thread.delete', 'post.softDelete'])
  })

  it('pairs each flag tool with the action that authorises both directions', () => {
    expect(INLINE_TOOL_ACTIONS.lock).toEqual(INLINE_TOOL_ACTIONS.unlock)
    expect(INLINE_TOOL_ACTIONS.stick).toEqual(INLINE_TOOL_ACTIONS.unstick)
  })
})
