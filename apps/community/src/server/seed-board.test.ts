import { describe, expect, it } from 'vitest'

import { SEED_FORUM_ROWS, SEED_POST_ROWS, SEED_THREAD_ROWS } from './seed-board'

describe('fixture board', () => {
  it('keeps every forum and thread summary linked to real demo content', () => {
    for (const forum of SEED_FORUM_ROWS) {
      if (forum.type !== 'forum') continue
      const threads = SEED_THREAD_ROWS.filter((thread) => thread.forumId === forum.id)
      const posts = SEED_POST_ROWS.filter((post) => post.forumId === forum.id)
      expect(forum.threadCount).toBe(threads.length)
      expect(forum.postCount).toBe(posts.length)

      if (forum.lastPost !== null) {
        expect(threads.find((thread) => thread.id === forum.lastPost!.threadId)?.title).toBe(
          forum.lastPost.threadTitle,
        )
        expect(posts.some((post) => post.id === forum.lastPost!.postId)).toBe(true)
      }
    }

    for (const thread of SEED_THREAD_ROWS) {
      const posts = SEED_POST_ROWS.filter((post) => post.threadId === thread.id)
      expect(posts).toHaveLength(thread.replyCount + 1)
      expect(posts.some((post) => post.id === thread.lastPost?.postId)).toBe(true)
    }
  })
})
