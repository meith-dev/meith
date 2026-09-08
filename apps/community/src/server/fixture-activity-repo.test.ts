import { describe, expect, it } from 'vitest'

import { PUBLIC_CONTENT, unrestrictedAudience } from '@meith/core'

import { FixtureActivityRepository } from './fixture-activity-repo'
import {
  SEED_FORUM_ROWS,
  SEED_MEMBER_PROFILES,
  SEED_POST_ROWS,
  SEED_THREAD_ROWS,
} from './seed-board'

const repo = new FixtureActivityRepository()
const scope = {
  ...unrestrictedAudience(SEED_FORUM_ROWS.map((forum) => forum.id)),
  content: PUBLIC_CONTENT,
}

describe('fixture activity', () => {
  it('derives sidebar rows and statistics from the same populated board', async () => {
    const latestThreads = await repo.threads(5, scope)
    const latestPosts = await repo.posts(5, scope)
    expect(latestThreads).toHaveLength(5)
    expect(latestPosts).toHaveLength(5)
    expect(latestPosts.map((row) => row.postId)).toEqual(
      [...SEED_POST_ROWS]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
        .slice(0, 5)
        .map((post) => post.id),
    )
    for (const row of latestThreads) {
      expect(SEED_THREAD_ROWS.find((thread) => thread.id === row.threadId)?.title).toBe(row.title)
      expect(
        SEED_POST_ROWS.find((post) => post.threadId === row.threadId && post.isFirstPost)
          ?.createdAt,
      ).toEqual(row.createdAt)
    }
    expect(await repo.readTotals()).toMatchObject({
      threadCount: SEED_THREAD_ROWS.length,
      postCount: SEED_POST_ROWS.length,
      memberCount: SEED_MEMBER_PROFILES.length,
    })
    expect((await repo.topPosters(5))[0]?.postCount).toBe(
      Math.max(...SEED_MEMBER_PROFILES.map((member) => member.postCount)),
    )
    expect((await repo.mostViewed(5, scope))[0]?.viewCount).toBe(
      Math.max(...SEED_THREAD_ROWS.map((thread) => thread.viewCount)),
    )
    expect((await repo.mostReplied(5, scope))[0]?.replyCount).toBe(
      Math.max(...SEED_THREAD_ROWS.map((thread) => thread.replyCount)),
    )
  })

  it('applies forum access, own-thread restrictions and content visibility to every activity list', async () => {
    for (const read of [
      repo.threads.bind(repo),
      repo.posts.bind(repo),
      repo.mostViewed.bind(repo),
      repo.mostReplied.bind(repo),
    ]) {
      expect(await read(5, { ...scope, forumIds: [] })).toEqual([])
      expect(await read(5, { ...scope, content: { ...PUBLIC_CONTENT, states: [] } })).toEqual([])
      expect(await read(5, { ...scope, forumIds: [200], ownThreadsOnlyForumIds: [200] })).toEqual(
        [],
      )
      const own = await read(5, {
        ...scope,
        forumIds: [200],
        ownThreadsOnlyForumIds: [200],
        viewerUserId: 1,
      })
      expect(own.length).toBeGreaterThan(0)
      expect(own.every((row) => row.threadId === 21)).toBe(true)
    }
  })
})
