import { describe, expect, it } from 'vitest'

import { SEED_FORUM_ROWS, SEED_POST_ROWS, SEED_THREAD_ROWS } from './seed-board'

function subtree(path: string): readonly (typeof SEED_FORUM_ROWS)[number][] {
  return SEED_FORUM_ROWS.filter((forum) => forum.path === path || forum.path.startsWith(`${path}.`))
}

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

  it('counts every forum as its whole subtree, which is what a category is for', () => {
    for (const forum of SEED_FORUM_ROWS) {
      const beneath = subtree(forum.path)
      const threads = SEED_THREAD_ROWS.filter((thread) =>
        beneath.some((row) => row.id === thread.forumId),
      )
      const posts = SEED_POST_ROWS.filter((post) => beneath.some((row) => row.id === post.forumId))

      expect(forum.threadCount, `${forum.title} thread count`).toBe(threads.length)
      expect(forum.postCount, `${forum.title} post count`).toBe(posts.length)

      const newest = [...posts].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
      )[0]
      expect(forum.lastPost?.postId ?? null, `${forum.title} last post`).toBe(newest?.id ?? null)
    }
  })
})
