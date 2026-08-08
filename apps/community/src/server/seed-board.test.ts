import { describe, expect, it } from 'vitest'

import { SEED_COMMUNITY_ROWS, SEED_POST_ROWS, SEED_THREAD_ROWS } from './seed-board'

describe('fixture board', () => {
  it('keeps every community and thread summary linked to real demo content', () => {
    for (const community of SEED_COMMUNITY_ROWS) {
      if (community.type !== 'community') continue
      const threads = SEED_THREAD_ROWS.filter((thread) => thread.communityId === community.id)
      const posts = SEED_POST_ROWS.filter((post) => post.communityId === community.id)
      expect(community.threadCount).toBe(threads.length)
      expect(community.postCount).toBe(posts.length)

      if (community.lastPost !== null) {
        expect(threads.find((thread) => thread.id === community.lastPost!.threadId)?.title).toBe(
          community.lastPost.threadTitle,
        )
        expect(posts.some((post) => post.id === community.lastPost!.postId)).toBe(true)
      }
    }

    for (const thread of SEED_THREAD_ROWS) {
      const posts = SEED_POST_ROWS.filter((post) => post.threadId === thread.id)
      expect(posts).toHaveLength(thread.replyCount + 1)
      expect(posts.some((post) => post.id === thread.lastPost?.postId)).toBe(true)
    }
  })
})
