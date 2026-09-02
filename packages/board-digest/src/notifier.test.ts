import { beforeEach, describe, expect, it } from 'vitest'

import type { BoardDigestCadence } from './modes'
import { BoardDigestNotifier } from './notifier'
import type { BoardDigestRepository, BoardDigestThread, EligibleMember } from './types'

const NOW = new Date('2026-09-02T12:00:00Z')

const LAPSED_MEMBER: EligibleMember = { userId: 7, lastActiveAt: new Date('2026-08-01T00:00:00Z') }

function thread(over: Partial<BoardDigestThread> = {}): BoardDigestThread {
  return {
    threadId: 10,
    title: 'A thread',
    href: '/thread/10-a-thread',
    forumTitle: 'General',
    replyCount: 3,
    lastAuthor: 'ivan',
    ...over,
  }
}

interface Raised {
  userId: number
  kind: string
  data: Record<string, unknown>
  href: string | null
  dedupeKey: string | null
}

class MemoryRepository implements BoardDigestRepository {
  due: EligibleMember[] = []
  readonly recorded: Array<{ userId: number }> = []
  dueArgs: {
    cadence: BoardDigestCadence
    dueBefore: Date
    lapsedBefore: Date
    limit: number
  } | null = null

  async dueMembers(input: {
    cadence: BoardDigestCadence
    dueBefore: Date
    lapsedBefore: Date
    limit: number
  }) {
    this.dueArgs = input
    return this.due.slice(0, input.limit)
  }

  async recordDigestRun(input: { userId: number }) {
    this.recorded.push({ userId: input.userId })
  }
}

let repository: MemoryRepository
let raised: Raised[]
let contentByUser: Map<number, readonly BoardDigestThread[]>
let failFor: number | null

function notifier(secret: string | null = null): BoardDigestNotifier {
  return new BoardDigestNotifier({
    repository,
    content: {
      async threadsActiveSince(userId) {
        if (failFor === userId) throw new Error('read failed')
        return contentByUser.get(userId) ?? []
      },
    },
    notifications: {
      async raise(input) {
        raised.push(input as Raised)
      },
    },
    unsubscribeSecret: secret,
    now: () => NOW,
  })
}

beforeEach(() => {
  repository = new MemoryRepository()
  raised = []
  contentByUser = new Map()
  failFor = null
})

describe('who is selected', () => {
  it('asks the repository for members lapsed and due, not just enabled', async () => {
    repository.due = [LAPSED_MEMBER]
    contentByUser.set(7, [thread()])

    await notifier().run('weekly', 7)

    expect(repository.dueArgs?.cadence).toBe('weekly')
    expect(repository.dueArgs?.lapsedBefore).toEqual(new Date('2026-08-26T12:00:00Z'))
    expect(repository.dueArgs?.dueBefore).toEqual(new Date('2026-08-26T12:00:00Z'))
  })

  it('a member the repository never returns — active, or the kind disabled — is never told', async () => {
    repository.due = []

    const { notified, considered } = await notifier().run('weekly', 7)

    expect(notified).toBe(0)
    expect(considered).toBe(0)
    expect(raised).toEqual([])
  })
})

describe('sending', () => {
  beforeEach(() => {
    repository.due = [LAPSED_MEMBER]
  })

  it('a lapsed, enabled member with board activity gets exactly one digest', async () => {
    contentByUser.set(7, [thread({ threadId: 10 }), thread({ threadId: 11, title: 'Another' })])

    const { notified, considered } = await notifier().run('weekly', 7)

    expect(considered).toBe(1)
    expect(notified).toBe(1)
    expect(raised).toHaveLength(1)
    expect(raised[0]?.kind).toBe('board.digest')
    expect(raised[0]?.userId).toBe(7)
    expect(raised[0]?.data.threadCount).toBe(2)
    expect(raised[0]?.dedupeKey).toBeNull()
  })

  it('carries a signed board-wide unsubscribe token', async () => {
    contentByUser.set(7, [thread()])

    await notifier('board-secret').run('weekly', 7)

    const token = raised[0]?.data.unsubscribe
    expect(typeof token).toBe('string')
    expect(String(token)).toContain('.board-digest.0.')
  })

  it('carries no token when the board has no secret', async () => {
    contentByUser.set(7, [thread()])

    await notifier().run('weekly', 7)

    expect(raised[0]?.data.unsubscribe).toBeNull()
  })

  it('sends nothing, and stamps no clock, when there was no activity to report', async () => {
    contentByUser.set(7, [])

    const { notified } = await notifier().run('weekly', 7)

    expect(notified).toBe(0)
    expect(raised).toEqual([])
    expect(repository.recorded).toEqual([])
  })

  it('stamps the member’s clock only after a successful send', async () => {
    contentByUser.set(7, [thread()])

    await notifier().run('weekly', 7)

    expect(repository.recorded).toEqual([{ userId: 7 }])
  })

  it('bounds the thread list and counts the rest', async () => {
    contentByUser.set(
      7,
      Array.from({ length: 15 }, (_, i) => thread({ threadId: 20 + i, title: `Thread ${i}` })),
    )

    await notifier().run('weekly', 7)

    expect((raised[0]!.data.threads as unknown[]).length).toBe(10)
    expect(raised[0]?.data.more).toBe(5)
    expect(raised[0]?.data.threadCount).toBe(15)
  })

  it('reads content since the member’s own last visit, not the cadence window', async () => {
    let since: Date | null = null
    const custom = new BoardDigestNotifier({
      repository,
      content: {
        async threadsActiveSince(_userId, sinceArg) {
          since = sinceArg
          return [thread()]
        },
      },
      notifications: { async raise() {} },
      now: () => NOW,
    })

    await custom.run('weekly', 7)

    expect(since).toEqual(LAPSED_MEMBER.lastActiveAt)
  })
})

describe('permission filtering', () => {
  it('never puts a thread one recipient cannot see into another recipient’s digest', async () => {
    const memberA: EligibleMember = { userId: 1, lastActiveAt: new Date('2026-08-01T00:00:00Z') }
    const memberB: EligibleMember = { userId: 2, lastActiveAt: new Date('2026-08-01T00:00:00Z') }
    repository.due = [memberA, memberB]

    contentByUser.set(1, [thread({ threadId: 10, title: 'Public thread' })])
    contentByUser.set(2, [
      thread({ threadId: 10, title: 'Public thread' }),
      thread({ threadId: 99, title: 'Private forum thread' }),
    ])

    await notifier().run('weekly', 7)

    const forA = raised.find((r) => r.userId === 1)
    const forB = raised.find((r) => r.userId === 2)

    const titlesFor = (r: Raised | undefined) =>
      ((r === undefined ? [] : r.data.threads) as Array<{ title: string }>).map((t) => t.title)

    expect(titlesFor(forA)).toEqual(['Public thread'])
    expect(titlesFor(forB)).toEqual(['Public thread', 'Private forum thread'])
  })
})

describe('resilience', () => {
  beforeEach(() => {
    repository.due = [LAPSED_MEMBER, { userId: 8, lastActiveAt: new Date('2026-08-01T00:00:00Z') }]
  })

  it('keeps going when one member’s content read fails', async () => {
    failFor = 7
    contentByUser.set(8, [thread()])

    const { notified, considered } = await notifier().run('weekly', 7)

    expect(considered).toBe(2)
    expect(notified).toBe(1)
    expect(raised[0]?.userId).toBe(8)
  })

  it('never stamps the clock for a member it failed to read', async () => {
    failFor = 7

    await notifier().run('weekly', 7)

    expect(repository.recorded.some((r) => r.userId === 7)).toBe(false)
  })

  it('stops between members when its budget is spent, without losing the clock it already stamped', async () => {
    const controller = new AbortController()
    contentByUser.set(7, [thread()])
    contentByUser.set(8, [thread({ threadId: 30 })])

    const cutShort = new BoardDigestNotifier({
      repository,
      content: {
        async threadsActiveSince(userId) {
          return contentByUser.get(userId) ?? []
        },
      },
      notifications: {
        async raise(input) {
          raised.push(input as Raised)
          controller.abort()
        },
      },
      now: () => NOW,
    })

    const outcome = await cutShort.run('weekly', 7, 50, controller.signal)

    expect(outcome).toEqual({ notified: 1, considered: 1 })
    expect(raised.map((r) => r.userId)).toEqual([7])
    expect(repository.recorded).toEqual([{ userId: 7 }])
  })
})
