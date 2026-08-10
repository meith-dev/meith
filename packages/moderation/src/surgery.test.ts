import { describe, expect, it } from 'vitest'
import { ValidationError } from '@meith/core'

import {
  ThreadSurgery,
  type MergePlan,
  type SplitPlan,
  type SurgeryOutcome,
  type SurgeryRights,
  type SurgeryThread,
  type ThreadSurgeryRepository,
} from './surgery'

const NOW = new Date('2026-07-31T09:00:00Z')

const ALL: SurgeryRights = { merge: true, split: true }
const NONE: SurgeryRights = { merge: false, split: false }

class FakeThreads implements ThreadSurgeryRepository {
  threads = new Map<number, SurgeryThread>([
    [
      20,
      {
        id: 20,
        forumId: 4,
        slug: 'hello',
        title: 'Hello',
        visibility: 'visible',
        firstPostId: 100,
        visiblePosts: 4,
      },
    ],
    [
      21,
      {
        id: 21,
        forumId: 4,
        slug: 'other',
        title: 'Other',
        visibility: 'visible',
        firstPostId: 200,
        visiblePosts: 2,
      },
    ],
  ])

  posts: readonly number[] = [102, 103]

  splits: SplitPlan[] = []
  merges: MergePlan[] = []

  async find(threadId: number): Promise<SurgeryThread | null> {
    return this.threads.get(threadId) ?? null
  }

  async visiblePostIdsIn(
    threadId: number,
    postIds: readonly number[],
  ): Promise<readonly number[]> {
    return this.posts.filter((id) => postIds.includes(id))
  }

  async postsFrom(): Promise<readonly number[]> {
    return this.posts
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

function surgeryFor(threads: FakeThreads): ThreadSurgery {
  return new ThreadSurgery({ threads, now: () => NOW })
}

function splitInput(over: Partial<Parameters<ThreadSurgery['split']>[0]> = {}) {
  return {
    threadId: 20,
    fromPostId: 102,
    title: 'A new conversation',
    actorUserId: 7,
    rights: ALL,
    ...over,
  }
}

function mergeInput(over: Partial<Parameters<ThreadSurgery['merge']>[0]> = {}) {
  return {
    sourceThreadId: 21,
    targetThreadId: 20,
    actorUserId: 7,
    rights: ALL,
    targetRights: ALL,
    ...over,
  }
}

describe('ThreadSurgery.split', () => {
  it('hands the repository the posts from the chosen one onwards', async () => {
    const threads = new FakeThreads()
    const outcome = await surgeryFor(threads).split(splitInput())

    expect(threads.splits).toEqual([
      {
        sourceThreadId: 20,
        title: 'A new conversation',
        postIds: [102, 103],
        actorUserId: 7,
        at: NOW,
      },
    ])
    expect(outcome).toEqual({ threadId: 99, slug: 'split-off', posts: 2 })
  })

  it('refuses without the right', async () => {
    const threads = new FakeThreads()
    await expect(surgeryFor(threads).split(splitInput({ rights: NONE }))).rejects.toThrow(
      ValidationError,
    )
    expect(threads.splits).toEqual([])
  })

  it('refuses to split from the opening post', async () => {
    const threads = new FakeThreads()
    await expect(
      surgeryFor(threads).split(splitInput({ fromPostId: 100 })),
    ).rejects.toThrow(/Move it instead/)
    expect(threads.splits).toEqual([])
  })

  it('refuses when the selection is the whole thread', async () => {
    const threads = new FakeThreads()
    threads.posts = [101, 102, 103, 104]
    await expect(surgeryFor(threads).split(splitInput())).rejects.toThrow(
      /Move it instead/,
    )
    expect(threads.splits).toEqual([])
  })

  it('refuses when the post is not in the thread', async () => {
    const threads = new FakeThreads()
    threads.posts = []
    await expect(surgeryFor(threads).split(splitInput())).rejects.toThrow(
      /not in this thread/,
    )
    expect(threads.splits).toEqual([])
  })

  it('refuses a thread that is not on the board', async () => {
    const threads = new FakeThreads()
    threads.threads.set(20, { ...threads.threads.get(20)!, visibility: 'deleted' })
    await expect(surgeryFor(threads).split(splitInput())).rejects.toThrow(
      /not on the board/,
    )
  })

  it('refuses a thread that does not exist', async () => {
    const threads = new FakeThreads()
    threads.threads.delete(20)
    await expect(surgeryFor(threads).split(splitInput())).rejects.toThrow(
      /does not exist/,
    )
  })

  it('trims the title and requires one', async () => {
    const threads = new FakeThreads()
    await surgeryFor(threads).split(splitInput({ title: '  Trimmed  ' }))
    expect(threads.splits[0]!.title).toBe('Trimmed')

    await expect(surgeryFor(threads).split(splitInput({ title: '  a ' }))).rejects.toThrow(
      /needs a title/,
    )
    await expect(
      surgeryFor(threads).split(splitInput({ title: 'x'.repeat(151) })),
    ).rejects.toThrow(/at most 150/)
  })

  it('checks the rights before touching the repository at all', async () => {
    const threads = new FakeThreads()
    threads.threads.delete(20)
    await expect(surgeryFor(threads).split(splitInput({ rights: NONE }))).rejects.toThrow(
      /cannot split/,
    )
  })
})

describe('ThreadSurgery.merge', () => {
  it('absorbs the source into the target', async () => {
    const threads = new FakeThreads()
    const outcome = await surgeryFor(threads).merge(mergeInput())

    expect(threads.merges).toEqual([
      { sourceThreadId: 21, targetThreadId: 20, actorUserId: 7, at: NOW },
    ])
    expect(outcome.threadId).toBe(20)
  })

  it('refuses without the right in the source forum', async () => {
    const threads = new FakeThreads()
    await expect(surgeryFor(threads).merge(mergeInput({ rights: NONE }))).rejects.toThrow(
      /cannot merge threads here/,
    )
    expect(threads.merges).toEqual([])
  })

  it('refuses without the right at the target end', async () => {
    const threads = new FakeThreads()
    await expect(
      surgeryFor(threads).merge(mergeInput({ targetRights: NONE })),
    ).rejects.toThrow(/into that forum/)
    expect(threads.merges).toEqual([])
  })

  it('refuses to merge a thread into itself', async () => {
    const threads = new FakeThreads()
    await expect(
      surgeryFor(threads).merge(mergeInput({ targetThreadId: 21 })),
    ).rejects.toThrow(/into itself/)
    expect(threads.merges).toEqual([])
  })

  it('refuses when either end is missing or off the board', async () => {
    const gone = new FakeThreads()
    gone.threads.delete(21)
    await expect(surgeryFor(gone).merge(mergeInput())).rejects.toThrow(/does not exist/)

    const hidden = new FakeThreads()
    hidden.threads.set(20, { ...hidden.threads.get(20)!, visibility: 'unapproved' })
    await expect(surgeryFor(hidden).merge(mergeInput())).rejects.toThrow(
      /not on the board/,
    )
  })
})

describe('splitPosts', () => {
  it('splits the selected posts and reports nothing dropped', async () => {
    const threads = new FakeThreads()
    threads.posts = [102, 103]

    const outcome = await surgeryFor(threads).splitPosts({
      threadId: 20,
      postIds: [102, 103],
      title: 'A new conversation',
      actorUserId: 9,
      rights: { merge: false, split: true },
    })

    expect(outcome).toMatchObject({ threadId: 99, posts: 2, dropped: 0 })
    expect(threads.splits[0]).toMatchObject({
      sourceThreadId: 20,
      title: 'A new conversation',
      postIds: [102, 103],
    })
  })

  it('drops an ineligible tick and counts it', async () => {
    const threads = new FakeThreads()
    threads.posts = [102]

    const outcome = await surgeryFor(threads).splitPosts({
      threadId: 20,
      postIds: [102, 555],
      title: 'A new conversation',
      actorUserId: 9,
      rights: { merge: false, split: true },
    })

    expect(outcome.dropped).toBe(1)
    expect(threads.splits[0]!.postIds).toEqual([102])
  })

  it('refuses when nothing selected is in this thread', async () => {
    const threads = new FakeThreads()
    threads.posts = []

    await expect(
      surgeryFor(threads).splitPosts({
        threadId: 20,
        postIds: [555],
        title: 'A new conversation',
        actorUserId: 9,
        rights: { merge: false, split: true },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(threads.splits).toEqual([])
  })

  it('refuses an empty selection', async () => {
    const threads = new FakeThreads()
    await expect(
      surgeryFor(threads).splitPosts({
        threadId: 20,
        postIds: [],
        title: 'A new conversation',
        actorUserId: 9,
        rights: { merge: false, split: true },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a selection containing the opening post rather than dropping it', async () => {
    const threads = new FakeThreads()
    threads.threads.set(20, { ...threads.threads.get(20)!, firstPostId: 101 })
    threads.posts = [101, 102]

    await expect(
      surgeryFor(threads).splitPosts({
        threadId: 20,
        postIds: [101, 102],
        title: 'A new conversation',
        actorUserId: 9,
        rights: { merge: false, split: true },
      }),
    ).rejects.toThrow(/opening post/i)
    expect(threads.splits).toEqual([])
  })

  it('refuses a selection that is the whole thread', async () => {
    const threads = new FakeThreads()
    threads.threads.set(20, { ...threads.threads.get(20)!, visiblePosts: 2 })
    threads.posts = [102, 103]

    await expect(
      surgeryFor(threads).splitPosts({
        threadId: 20,
        postIds: [102, 103],
        title: 'A new conversation',
        actorUserId: 9,
        rights: { merge: false, split: true },
      }),
    ).rejects.toThrow(/whole thread/i)
  })

  it('refuses without the split right, and enforces the same title rule', async () => {
    const threads = new FakeThreads()
    threads.posts = [102]

    await expect(
      surgeryFor(threads).splitPosts({
        threadId: 20,
        postIds: [102],
        title: 'A new conversation',
        actorUserId: 9,
        rights: { merge: true, split: false },
      }),
    ).rejects.toBeInstanceOf(ValidationError)

    await expect(
      surgeryFor(threads).splitPosts({
        threadId: 20,
        postIds: [102],
        title: 'no',
        actorUserId: 9,
        rights: { merge: false, split: true },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(threads.splits).toEqual([])
  })
})
