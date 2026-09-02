import { describe, expect, it } from 'vitest'

import { PUBLIC_CONTENT } from '@meith/core'
import type { PostLocation, PostRepository } from '@meith/posts'
import type { ReadStateRepository, ThreadReadMarker } from '@meith/threads'

import { resolveUnreadGoto } from './unread-goto'

const options = { scope: PUBLIC_CONTENT, pageSize: 20 }

function readState(marker: ThreadReadMarker): ReadStateRepository {
  return {
    forUser: async () => {
      throw new Error('not used')
    },
    markerFor: async () => marker,
    markForumsRead: async () => undefined,
    markThreadRead: async () => undefined,
  }
}

function posts(overrides: Partial<PostRepository>): PostRepository {
  return {
    findRatingTarget: async () => null,
    findVisibleById: async () => null,
    findQuotable: async () => null,
    listRevisions: async () => [],
    locate: async () => null,
    locateFirstUnread: async () => null,
    listThread: async () => ({ rows: [], nextAfterId: null }),
    ...overrides,
  }
}

const thread = { id: 1, forumId: 2, lastPostId: 40 }

describe('resolveUnreadGoto', () => {
  it('jumps to the first post past the marker, mid-thread', async () => {
    const located: PostLocation = { number: 21, page: 2, afterId: 20 }
    const calls: unknown[] = []
    const repo = posts({
      locateFirstUnread: async (threadId, after, opts) => {
        calls.push([threadId, after, opts])
        return located
      },
    })

    const result = await resolveUnreadGoto(
      repo,
      readState({ lastReadPostId: 20, forumReadAt: null }),
      9,
      thread,
      options,
    )

    expect(result).toBe(located)
    expect(calls).toEqual([[1, { postId: 20, since: null }, options]])
  })

  it('treats a thread never read as unread from its very first post', async () => {
    const located: PostLocation = { number: 1, page: 1, afterId: null }
    const repo = posts({
      locateFirstUnread: async (_threadId, after) => (after.postId === 0 ? located : null),
    })

    const result = await resolveUnreadGoto(
      repo,
      readState({ lastReadPostId: null, forumReadAt: null }),
      9,
      thread,
      options,
    )

    expect(result).toBe(located)
  })

  it('falls back to the thread’s last page once the marker has caught up', async () => {
    const lastPage: PostLocation = { number: 40, page: 2, afterId: 20 }
    const repo = posts({
      locateFirstUnread: async () => null,
      locate: async (_threadId, postId) => (postId === thread.lastPostId ? lastPage : null),
    })

    const result = await resolveUnreadGoto(
      repo,
      readState({ lastReadPostId: 40, forumReadAt: null }),
      9,
      thread,
      options,
    )

    expect(result).toBe(lastPage)
  })

  it('answers nothing for a thread with no last post to fall back to', async () => {
    const repo = posts({ locateFirstUnread: async () => null })

    const result = await resolveUnreadGoto(
      repo,
      readState({ lastReadPostId: null, forumReadAt: null }),
      9,
      { ...thread, lastPostId: null },
      options,
    )

    expect(result).toBeNull()
  })

  it('passes the forum-level mark-all-read timestamp through to the query', async () => {
    const since = new Date('2026-06-01T00:00:00Z')
    const calls: unknown[] = []
    const repo = posts({
      locateFirstUnread: async (_threadId, after) => {
        calls.push(after)
        return null
      },
      locate: async () => null,
    })

    await resolveUnreadGoto(
      repo,
      readState({ lastReadPostId: null, forumReadAt: since }),
      9,
      thread,
      options,
    )

    expect(calls).toEqual([{ postId: 0, since }])
  })
})
