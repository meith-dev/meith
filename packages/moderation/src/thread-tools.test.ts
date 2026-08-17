import { describe, expect, it } from 'vitest'

import { ValidationError } from '@meith/core'

import {
  type MoveDestination,
  parseThreadTool,
  type ThreadToolRights,
  ThreadTools,
  type ThreadToolsRepository,
  type ThreadToolTarget,
} from './thread-tools'

const NOW = new Date('2026-07-30T12:00:00Z')

const ALL: ThreadToolRights = {
  lock: true,
  stick: true,
  move: true,
  delete: true,
  restore: true,
}
const NONE: ThreadToolRights = {
  lock: false,
  stick: false,
  move: false,
  delete: false,
  restore: false,
}

class FakeThreads implements ThreadToolsRepository {
  readonly calls: string[] = []
  target: Partial<ThreadToolTarget> = {}
  destination: MoveDestination | null = { id: 9, type: 'forum', allowThreads: true }

  async find(): Promise<ThreadToolTarget | null> {
    if (this.target === null) return null
    return {
      id: 20,
      forumId: 4,
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
        toForumId: 9,
        actorUserId: 7,
        rights,
        destinationRights: ALL,
      }),
    ).rejects.toThrow(ValidationError)
    expect(threads.calls).toEqual([])
  })

  describe('moving', () => {
    it('needs the right at both ends', async () => {
      const threads = new FakeThreads()

      await expect(
        toolsFor(threads).apply({
          threadId: 20,
          tool: 'move',
          toForumId: 9,
          actorUserId: 7,
          rights: ALL,
          destinationRights: NONE,
        }),
      ).rejects.toThrow(/cannot move threads into/i)
      expect(threads.calls).toEqual([])

      await toolsFor(threads).apply({
        threadId: 20,
        tool: 'move',
        toForumId: 9,
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
      ).rejects.toThrow(/choose a forum/i)
    })

    it.each(['category', 'link'] as const)('refuses a %s as a destination', async (type) => {
      const threads = new FakeThreads()
      threads.destination = { id: 9, type, allowThreads: false }

      await expect(
        toolsFor(threads).apply({
          threadId: 20,
          tool: 'move',
          toForumId: 9,
          actorUserId: 7,
          rights: ALL,
          destinationRights: ALL,
        }),
      ).rejects.toThrow(/not a forum/i)
      expect(threads.calls).toEqual([])
    })

    it('refuses a move to where it already is', async () => {
      const threads = new FakeThreads()
      await expect(
        toolsFor(threads).apply({
          threadId: 20,
          tool: 'move',
          toForumId: 4,
          actorUserId: 7,
          rights: ALL,
          destinationRights: ALL,
        }),
      ).rejects.toThrow(/already in that forum/i)
    })
  })

  describe('what has to be on the board', () => {
    it.each(['lock', 'stick', 'move'] as const)(
      'refuses %s on a thread that is not visible',
      async (tool) => {
        const threads = new FakeThreads()
        threads.target = { visibility: 'deleted' }

        await expect(
          toolsFor(threads).apply({
            threadId: 20,
            tool,
            toForumId: 9,
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

describe('copy', () => {
  it('copies when the move right is held at both ends', async () => {
    const threads = new FakeThreads()

    const outcome = await toolsFor(threads).apply({
      threadId: 20,
      tool: 'copy',
      toForumId: 9,
      actorUserId: 1,
      rights: ALL,
      destinationRights: ALL,
    })

    expect(outcome).toMatchObject({ tool: 'copy', threadId: 77, changed: true })
    expect(threads.calls).toEqual(['copy'])
  })

  it('refuses without the move right in the source forum', async () => {
    const threads = new FakeThreads()
    await expect(
      toolsFor(threads).apply({
        threadId: 20,
        tool: 'copy',
        toForumId: 9,
        actorUserId: 1,
        rights: { ...ALL, move: false },
        destinationRights: ALL,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(threads.calls).toEqual([])
  })

  it('refuses without the move right in the destination forum', async () => {
    const threads = new FakeThreads()
    await expect(
      toolsFor(threads).apply({
        threadId: 20,
        tool: 'copy',
        toForumId: 9,
        actorUserId: 1,
        rights: ALL,
        destinationRights: { ...ALL, move: false },
      }),
    ).rejects.toThrow(/cannot copy threads into/i)
    expect(threads.calls).toEqual([])
  })

  it('refuses a destination that is not a forum threads can live in', async () => {
    const threads = new FakeThreads()
    threads.destination = { id: 9, type: 'category', allowThreads: false }
    await expect(
      toolsFor(threads).apply({
        threadId: 20,
        tool: 'copy',
        toForumId: 9,
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
        toForumId: 9,
        actorUserId: 1,
        rights: ALL,
        destinationRights: ALL,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('allows a copy into the thread"s own forum', async () => {
    const threads = new FakeThreads()
    const outcome = await toolsFor(threads).apply({
      threadId: 20,
      tool: 'copy',
      toForumId: 4,
      actorUserId: 1,
      rights: ALL,
      destinationRights: ALL,
    })
    expect(outcome.changed).toBe(true)
  })
})
