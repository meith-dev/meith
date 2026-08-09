import { describe, expect, it } from 'vitest'

import { SEED_FORUM_ROWS, SEED_POST_ROWS, SEED_THREAD_ROWS } from './seed-board'

/** Every forum at or beneath `path`, by the same prefix rule the recount uses. */
function subtree(path: string): readonly (typeof SEED_FORUM_ROWS)[number][] {
  return SEED_FORUM_ROWS.filter(
    (forum) => forum.path === path || forum.path.startsWith(`${path}.`),
  )
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

  /**
   * Counters are subtree-inclusive, categories included.
   *
   * The case above skips categories, which is how the `Main` row came to claim
   * zero threads on a board with three. That is not a cosmetic difference: the
   * board's own totals are `sum(thread_count) from forums where parent_id is
   * null` (`PostgresStatsRepository.rollUp`), so a root category understating
   * itself makes the control panel's Overview report an empty board — which is
   * exactly what it did.
   *
   * Asserted over **every** row rather than over the categories, because the rule
   * is not "categories are special": `rollUpAncestorCounters` and F38's recount
   * both define a forum's counters as itself plus everything beneath it, and a
   * leaf simply has nothing beneath it.
   */
  it('counts every forum as its whole subtree, which is what a category is for', () => {
    for (const forum of SEED_FORUM_ROWS) {
      const beneath = subtree(forum.path)
      const threads = SEED_THREAD_ROWS.filter((thread) =>
        beneath.some((row) => row.id === thread.forumId),
      )
      const posts = SEED_POST_ROWS.filter((post) =>
        beneath.some((row) => row.id === post.forumId),
      )

      expect(forum.threadCount, `${forum.title} thread count`).toBe(threads.length)
      expect(forum.postCount, `${forum.title} post count`).toBe(posts.length)

      /* And the newest post in that subtree is the one the row advertises. */
      const newest = [...posts].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
      )[0]
      expect(forum.lastPost?.postId ?? null, `${forum.title} last post`).toBe(
        newest?.id ?? null,
      )
    }
  })
})
