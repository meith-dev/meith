/** F48 — the queue's rules, without a database. */
import { describe, expect, it } from 'vitest'
import { ValidationError } from '@meith/core'

import {
  MAX_CHUNK,
  ModerationQueue,
  parseSelection,
  type ModerationQueueRepository,
  type PendingItem,
  type QueuePage,
  type QueueSelection,
} from './queue'

const NOW = new Date('2026-07-30T12:00:00Z')

/** Pending items live in forum 4 unless the test says otherwise. */
class FakeQueue implements ModerationQueueRepository {
  readonly applied: Array<{
    decision: string
    threadIds: readonly number[]
    postIds: readonly number[]
    at: Date
  }> = []
  listed: QueuePage = { items: [] }
  /** Which selected items are still pending, and where they are. */
  pending = new Map<string, number>()

  async list(): Promise<QueuePage> {
    return this.listed
  }

  async countPending(): Promise<number> {
    return this.pending.size
  }

  async resolve(selection: readonly QueueSelection[]): Promise<readonly PendingItem[]> {
    return selection.flatMap((item) => {
      const forumId = this.pending.get(`${item.kind}:${item.id}`)
      return forumId === undefined ? [] : [{ ...item, forumId }]
    })
  }

  async apply(input: {
    decision: string
    threadIds: readonly number[]
    postIds: readonly number[]
    at: Date
  }): Promise<number> {
    this.applied.push(input)
    return input.threadIds.length + input.postIds.length
  }
}

function queueWith(pending: Record<string, number>): {
  repo: FakeQueue
  queue: ModerationQueue
} {
  const repo = new FakeQueue()
  repo.pending = new Map(Object.entries(pending))
  return { repo, queue: new ModerationQueue({ queue: repo, now: () => NOW }) }
}

const MODERATED = new Set([4])

describe('ModerationQueue.decide', () => {
  it('applies a decision to the items in forums the actor moderates', async () => {
    const { repo, queue } = queueWith({ 'thread:10': 4, 'post:20': 4 })

    const outcome = await queue.decide({
      selection: [
        { kind: 'thread', id: 10 },
        { kind: 'post', id: 20 },
      ],
      decision: 'approve',
      moderatedForumIds: MODERATED,
      actorUserId: 7,
    })

    expect(outcome).toEqual({ decision: 'approve', applied: 2, refused: 0, missing: 0 })
    expect(repo.applied[0]).toMatchObject({
      decision: 'approve',
      threadIds: [10],
      postIds: [20],
      at: NOW,
    })
  })

  /*
   * The re-read is the authorisation. An id in a POST body says which row to
   * act on and nothing about whether this actor may — so the forum comes from
   * the database and is then checked, rather than arriving with the request.
   */
  it('refuses an item in a forum the actor does not moderate, and says so', async () => {
    const { repo, queue } = queueWith({ 'thread:10': 4, 'post:20': 99 })

    const outcome = await queue.decide({
      selection: [
        { kind: 'thread', id: 10 },
        { kind: 'post', id: 20 },
      ],
      decision: 'approve',
      moderatedForumIds: MODERATED,
      actorUserId: 7,
    })

    expect(outcome).toMatchObject({ applied: 1, refused: 1 })
    expect(repo.applied[0]).toMatchObject({ threadIds: [10], postIds: [] })
  })

  /*
   * Two moderators clearing the same queue is the normal case, not the edge
   * case. An item somebody else already handled is no longer pending, and
   * reporting it beats a silent count that does not add up.
   */
  it('reports items another moderator already handled', async () => {
    const { queue } = queueWith({ 'thread:10': 4 })

    const outcome = await queue.decide({
      selection: [
        { kind: 'thread', id: 10 },
        { kind: 'post', id: 20 },
      ],
      decision: 'reject',
      moderatedForumIds: MODERATED,
      actorUserId: 7,
    })

    expect(outcome).toMatchObject({ applied: 1, refused: 0, missing: 1 })
  })

  it('counts a duplicated selection once', async () => {
    const { repo, queue } = queueWith({ 'post:20': 4 })

    const outcome = await queue.decide({
      selection: [
        { kind: 'post', id: 20 },
        { kind: 'post', id: 20 },
      ],
      decision: 'approve',
      moderatedForumIds: MODERATED,
      actorUserId: 7,
    })

    expect(outcome).toMatchObject({ applied: 1, missing: 0 })
    expect(repo.applied[0]!.postIds).toEqual([20])
  })

  it('refuses an empty selection', async () => {
    const { queue } = queueWith({})
    await expect(
      queue.decide({
        selection: [],
        decision: 'approve',
        moderatedForumIds: MODERATED,
        actorUserId: 7,
      }),
    ).rejects.toThrow(ValidationError)
  })

  /*
   * Every item costs a transaction with counter updates and a last-post repair
   * up the tree. An unbounded selection is a request that runs until the
   * platform kills it — halfway through a bulk approval, with no record of
   * where it stopped.
   */
  it('refuses a selection larger than one chunk', async () => {
    const { repo, queue } = queueWith({})
    const selection = Array.from({ length: MAX_CHUNK + 1 }, (_, i) => ({
      kind: 'post' as const,
      id: i + 1,
    }))

    await expect(
      queue.decide({
        selection,
        decision: 'approve',
        moderatedForumIds: MODERATED,
        actorUserId: 7,
      }),
    ).rejects.toThrow(/at most/i)
    expect(repo.applied).toHaveLength(0)
  })

  it('writes nothing when every selected item is refused', async () => {
    const { repo, queue } = queueWith({ 'post:20': 99 })

    const outcome = await queue.decide({
      selection: [{ kind: 'post', id: 20 }],
      decision: 'approve',
      moderatedForumIds: MODERATED,
      actorUserId: 7,
    })

    expect(outcome).toMatchObject({ applied: 0, refused: 1 })
    expect(repo.applied).toHaveLength(0)
  })
})

describe('ModerationQueue.list', () => {
  it('asks for nothing when the actor moderates nothing', async () => {
    const { repo, queue } = queueWith({})
    let asked = false
    repo.list = async () => {
      asked = true
      return { items: [] }
    }

    expect(await queue.list([])).toEqual({ items: [] })
    expect(await queue.countPending([])).toBe(0)
    expect(asked).toBe(false)
  })
})

describe('parseSelection', () => {
  it('reads the checkbox values a native form submits', () => {
    expect(parseSelection(['thread:10', 'post:20'])).toEqual([
      { kind: 'thread', id: 10 },
      { kind: 'post', id: 20 },
    ])
  })

  /*
   * A malformed entry is a tampered or truncated POST. Acting on the
   * unambiguous parts and letting the rest fall out as "missing" beats guessing
   * what somebody meant by `post:0` — which, guessed generously, is every post.
   */
  it('drops anything that is not exactly kind:id', () => {
    expect(
      parseSelection(['', 'post:0', 'post:-1', 'thread:', 'user:5', 'post:1x', 'post:1']),
    ).toEqual([{ kind: 'post', id: 1 }])
  })
})
