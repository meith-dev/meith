import { describe, expect, it } from 'vitest'

import {
  SEED_BOARD,
  SEED_FORUM_ROWS,
  SEED_MEMBER_PROFILES,
  SEED_POST_ROWS,
  SEED_THREAD_ROWS,
} from './seed-board'

function subtree(path: string): readonly (typeof SEED_FORUM_ROWS)[number][] {
  return SEED_FORUM_ROWS.filter((forum) => forum.path === path || forum.path.startsWith(`${path}.`))
}

describe('fixture board', () => {
  it('provides a populated board with unique records, profiles and permission chains', () => {
    expect(SEED_FORUM_ROWS.length).toBeGreaterThan(10)
    expect(SEED_THREAD_ROWS.length).toBeGreaterThan(50)
    expect(SEED_POST_ROWS.length).toBeGreaterThan(200)
    expect(SEED_MEMBER_PROFILES.length).toBeGreaterThan(20)
    for (const rows of [SEED_FORUM_ROWS, SEED_THREAD_ROWS, SEED_POST_ROWS, SEED_MEMBER_PROFILES]) {
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
    }
    expect(new Set(SEED_MEMBER_PROFILES.map((member) => member.username)).size).toBe(
      SEED_MEMBER_PROFILES.length,
    )
    for (const forum of SEED_FORUM_ROWS) {
      expect(SEED_BOARD.chains[forum.id]).toEqual(forum.path.split('.').map(Number).reverse())
      if (forum.parentId !== null)
        expect(SEED_FORUM_ROWS.some((row) => row.id === forum.parentId)).toBe(true)
    }
    for (const post of SEED_POST_ROWS) {
      const member = SEED_MEMBER_PROFILES.find((member) => member.id === post.authorUserId)
      if (post.authorUserId !== null) {
        expect(member?.username).toBe(post.authorUsername)
        expect(member?.postCount).toBe(
          SEED_POST_ROWS.filter((row) => row.authorUserId === post.authorUserId).length,
        )
      }
      expect(post.authorPostCount).toBe(member?.postCount ?? 0)
      expect(SEED_THREAD_ROWS.find((thread) => thread.id === post.threadId)?.forumId).toBe(
        post.forumId,
      )
    }
  })

  it('keeps every forum and thread summary linked to sample content', () => {
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
