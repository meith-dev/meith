/** F50 — the thread-tool rules, without a database. */
import { describe, expect, it } from 'vitest'
import { ValidationError } from '@meith/core'

import {
  ThreadTools,
  parseThreadTool,
  type MoveDestination,
  type ThreadToolRights,
  type ThreadToolTarget,
  type ThreadToolsRepository,
} from './thread-tools'

const NOW = new Date('2026-07-30T12:00:00Z')

const ALL: ThreadToolRights = { lock: true, stick: true, move: true, delete: true }
const NONE: ThreadToolRights = { lock: false, stick: false, move: false, delete: false }

class FakeThreads implements ThreadToolsRepository {
  readonly calls: string[] = []
  target: Partial<ThreadToolTarget> = {}
  destination: MoveDestination | null = { id: 9, type: 'community' }

  async find(): Promise<ThreadToolTarget | null> {
    if (this.target === null) return null
    return {
      id: 20,
      communityId: 4,
      slug: 'hello',
      title: 'Hello',
      isLocked: false,
      isSticky: false,
      visibility: 'visible',
      ...this.target,
    }
  }

  async findDestination(): Promise<MoveDestination | null> {
    return this.destination
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

function toolsFor(threads: FakeThreads): ThreadTools {
  return new ThreadTools({ threads, now: () => NOW })
}

describe('ThreadTools', () => {
  it('locks, pins and deletes when the rights are held', async () => {
    const threads = new FakeThreads()
    const tools = toolsFor(threads)

    await tools.apply({ threadId: 20, tool: 'lock', actorUserId: 7, rights: ALL })
    await tools.apply({ threadId: 20, tool: 'stick', actorUserId: 7, rights: ALL })
    await tools.apply({ threadId: 20, tool: 'delete', actorUserId: 7, rights: ALL })

    expect(threads.calls).toEqual(['setLocked', 'setSticky', 'setVisibility'])
  })

  it.each([
    ['lock', { ...ALL, lock: false }],
    ['stick', { ...ALL, stick: false }],
    ['move', { ...ALL, move: false }],
    ['delete', { ...ALL, delete: false }],
  ] as const)('refuses %s without the right', async (tool, rights) => {
    const threads = new FakeThreads()
    await expect(
      toolsFor(threads).apply({
        threadId: 20,
        tool,
        toCommunityId: 9,
        actorUserId: 7,
        rights,
        destinationRights: ALL,
      }),
    ).rejects.toThrow(ValidationError)
    expect(threads.calls).toEqual([])
  })

  describe('moving', () => {
    /*
     * The rule a "can this actor moderate here" check alone gets wrong. Rights
     * in the source only would let a moderator move a thread out from under the
     * people watching it, into a community where they have no standing at all.
     */
    it('needs the right at both ends', async () => {
      const threads = new FakeThreads()

      await expect(
        toolsFor(threads).apply({
          threadId: 20,
          tool: 'move',
          toCommunityId: 9,
          actorUserId: 7,
          rights: ALL,
          destinationRights: NONE,
        }),
      ).rejects.toThrow(/cannot move threads into/i)
      expect(threads.calls).toEqual([])

      await toolsFor(threads).apply({
        threadId: 20,
        tool: 'move',
        toCommunityId: 9,
        actorUserId: 7,
        rights: ALL,
        destinationRights: ALL,
      })
      expect(threads.calls).toEqual(['move'])
    })

    it('refuses a missing destination', async () => {
      const threads = new FakeThreads()
      await expect(
        toolsFor(threads).apply({
          threadId: 20,
          tool: 'move',
          actorUserId: 7,
          rights: ALL,
          destinationRights: ALL,
        }),
      ).rejects.toThrow(/choose a community/i)
    })

    /* A category holds communities and a link holds nothing: both strand the thread. */
    it.each(['category', 'link'] as const)('refuses a %s as a destination', async (type) => {
      const threads = new FakeThreads()
      threads.destination = { id: 9, type }

      await expect(
        toolsFor(threads).apply({
          threadId: 20,
          tool: 'move',
          toCommunityId: 9,
          actorUserId: 7,
          rights: ALL,
          destinationRights: ALL,
        }),
      ).rejects.toThrow(/not a community/i)
      expect(threads.calls).toEqual([])
    })

    it('refuses a move to where it already is', async () => {
      const threads = new FakeThreads()
      await expect(
        toolsFor(threads).apply({
          threadId: 20,
          tool: 'move',
          toCommunityId: 4,
          actorUserId: 7,
          rights: ALL,
          destinationRights: ALL,
        }),
      ).rejects.toThrow(/already in that community/i)
    })
  })

  describe('what has to be on the board', () => {
    /*
     * Pinning a deleted thread is not wrong so much as meaningless, and it
     * makes the listing's sort key depend on a flag set on something nobody can
     * see.
     */
    it.each(['lock', 'stick', 'move'] as const)(
      'refuses %s on a thread that is not visible',
      async (tool) => {
        const threads = new FakeThreads()
        threads.target = { visibility: 'deleted' }

        await expect(
          toolsFor(threads).apply({
            threadId: 20,
            tool,
            toCommunityId: 9,
            actorUserId: 7,
            rights: ALL,
            destinationRights: ALL,
          }),
        ).rejects.toThrow(/not on the board/i)
      },
    )

    it('refuses to delete something already gone, or restore something present', async () => {
      const threads = new FakeThreads()
      threads.target = { visibility: 'deleted' }
      await expect(
        toolsFor(threads).apply({ threadId: 20, tool: 'delete', actorUserId: 7, rights: ALL }),
      ).rejects.toThrow(ValidationError)

      threads.target = { visibility: 'visible' }
      await expect(
        toolsFor(threads).apply({ threadId: 20, tool: 'restore', actorUserId: 7, rights: ALL }),
      ).rejects.toThrow(/not deleted/i)
    })

    it('restores a deleted thread', async () => {
      const threads = new FakeThreads()
      threads.target = { visibility: 'deleted' }

      await toolsFor(threads).apply({
        threadId: 20,
        tool: 'restore',
        actorUserId: 7,
        rights: ALL,
      })
      expect(threads.calls).toEqual(['setVisibility'])
    })
  })

  it('reports an unapplied change rather than throwing', async () => {
    const threads = new FakeThreads()
    threads.setLocked = async () => false

    const outcome = await toolsFor(threads).apply({
      threadId: 20,
      tool: 'lock',
      actorUserId: 7,
      rights: ALL,
    })
    expect(outcome).toMatchObject({ tool: 'lock', changed: false })
  })
})

describe('parseThreadTool', () => {
  /*
   * Eight since copy landed. `copy` was in the *rejected* list until then,
   * which is what a deferral looks like when it is pinned rather than assumed.
   */
  it('accepts the eight tools and nothing else', () => {
    for (const tool of [
      'lock',
      'unlock',
      'stick',
      'unstick',
      'move',
      'copy',
      'delete',
      'restore',
    ]) {
      expect(parseThreadTool(tool)).toBe(tool)
    }
    for (const bad of [undefined, '', 'destroy', 'LOCK', 'duplicate']) {
      expect(parseThreadTool(bad)).toBeNull()
    }
  })
})

/**
 * F50's copy, and the rule it borrows.
 *
 * Authorised by `thread.move` at **both ends** rather than by a right of its
 * own: copying is moving that leaves the original behind, so the destination's
 * moderators have the same interest in it, and an eighth column on
 * `community_moderators` distinguishing two acts nobody grants separately would be
 * the wrong shape.
 */
describe('copy', () => {
  it('copies when the move right is held at both ends', async () => {
    const threads = new FakeThreads()

    const outcome = await toolsFor(threads).apply({
      threadId: 20,
      tool: 'copy',
      toCommunityId: 9,
      actorUserId: 1,
      rights: ALL,
      destinationRights: ALL,
    })

    /* The outcome names the *new* thread — the only tool whose result moves. */
    expect(outcome).toMatchObject({ tool: 'copy', threadId: 77, changed: true })
    expect(threads.calls).toEqual(['copy'])
  })

  it('refuses without the move right in the source community', async () => {
    const threads = new FakeThreads()
    await expect(
      toolsFor(threads).apply({
        threadId: 20,
        tool: 'copy',
        toCommunityId: 9,
        actorUserId: 1,
        rights: { ...ALL, move: false },
        destinationRights: ALL,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(threads.calls).toEqual([])
  })

  it('refuses without the move right in the destination community', async () => {
    const threads = new FakeThreads()
    await expect(
      toolsFor(threads).apply({
        threadId: 20,
        tool: 'copy',
        toCommunityId: 9,
        actorUserId: 1,
        rights: ALL,
        destinationRights: { ...ALL, move: false },
      }),
    ).rejects.toThrow(/cannot copy threads into/i)
    expect(threads.calls).toEqual([])
  })

  it('refuses a destination that is not a community threads can live in', async () => {
    const threads = new FakeThreads()
    threads.destination = { id: 9, type: 'category' }
    await expect(
      toolsFor(threads).apply({
        threadId: 20,
        tool: 'copy',
        toCommunityId: 9,
        actorUserId: 1,
        rights: ALL,
        destinationRights: ALL,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a thread that is not on the board', async () => {
    const threads = new FakeThreads()
    threads.target = { visibility: 'deleted' }
    await expect(
      toolsFor(threads).apply({
        threadId: 20,
        tool: 'copy',
        toCommunityId: 9,
        actorUserId: 1,
        rights: ALL,
        destinationRights: ALL,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  /*
   * Unlike a move, the destination may be the source community: forking a
   * discussion in place is legitimate, and nothing left so there is no pointer
   * to repair.
   */
  it('allows a copy into the thread"s own community', async () => {
    const threads = new FakeThreads()
    const outcome = await toolsFor(threads).apply({
      threadId: 20,
      tool: 'copy',
      toCommunityId: 4,
      actorUserId: 1,
      rights: ALL,
      destinationRights: ALL,
    })
    expect(outcome.changed).toBe(true)
  })
})
