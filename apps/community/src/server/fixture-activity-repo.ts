import 'server-only'

import { audienceFilterIn, authorFilterAdmits } from '@meith/core'
import type {
  BoardTotals,
  LatestPostRow,
  LatestScope,
  LatestThreadRow,
  TopPoster,
  TopThread,
} from '@meith/db'

import {
  SEED_FORUM_ROWS,
  SEED_MEMBER_PROFILES,
  SEED_POST_ROWS,
  SEED_THREAD_ROWS,
} from './seed-board'

const forums = new Map(SEED_FORUM_ROWS.map((row) => [row.id, row]))
const threads = new Map(SEED_THREAD_ROWS.map((row) => [row.id, row]))
const firstPosts = new Map(
  SEED_POST_ROWS.filter((post) => post.isFirstPost).map((post) => [post.threadId, post]),
)

function visibleThreads(scope: LatestScope) {
  return SEED_THREAD_ROWS.filter(
    (thread) =>
      scope.content.states.includes(thread.visibility) &&
      authorFilterAdmits(audienceFilterIn(scope, thread.forumId), thread.authorUserId),
  )
}

export class FixtureActivityRepository {
  async threads(limit: number, scope: LatestScope): Promise<readonly LatestThreadRow[]> {
    return visibleThreads(scope)
      .map((thread) => ({
        threadId: thread.id,
        title: thread.title,
        slug: thread.slug,
        forumId: thread.forumId,
        forumTitle: forums.get(thread.forumId)!.title,
        forumSlug: forums.get(thread.forumId)!.slug,
        authorUserId: thread.authorUserId,
        authorUsername: thread.authorUsername,
        replyCount: thread.replyCount,
        createdAt: firstPosts.get(thread.id)!.createdAt,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.threadId - a.threadId)
      .slice(0, limit)
  }

  async posts(limit: number, scope: LatestScope): Promise<readonly LatestPostRow[]> {
    const visible = new Set(visibleThreads(scope).map((thread) => thread.id))
    return SEED_POST_ROWS.filter(
      (post) => visible.has(post.threadId) && scope.content.states.includes(post.visibility),
    )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
      .slice(0, limit)
      .map((post) => ({
        postId: post.id,
        threadId: post.threadId,
        threadTitle: threads.get(post.threadId)!.title,
        threadSlug: threads.get(post.threadId)!.slug,
        forumId: post.forumId,
        forumTitle: forums.get(post.forumId)!.title,
        forumSlug: forums.get(post.forumId)!.slug,
        authorUserId: post.authorUserId,
        authorUsername: post.authorUsername,
        createdAt: post.createdAt,
        messageSource: post.message.slice(0, 300),
      }))
  }

  async readTotals(): Promise<BoardTotals> {
    const newest = [...SEED_MEMBER_PROFILES].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
    )[0]
    return {
      threadCount: SEED_THREAD_ROWS.length,
      postCount: SEED_POST_ROWS.length,
      memberCount: SEED_MEMBER_PROFILES.length,
      newestUserId: newest?.id ?? null,
      newestUsername: newest?.username ?? null,
      computedAt: newest?.lastActiveAt ?? null,
    }
  }

  async topPosters(limit: number): Promise<readonly TopPoster[]> {
    return [...SEED_MEMBER_PROFILES]
      .filter((member) => member.postCount > 0)
      .sort((a, b) => b.postCount - a.postCount || a.id - b.id)
      .slice(0, limit)
      .map((member) => ({
        userId: member.id,
        username: member.username,
        postCount: member.postCount,
      }))
  }

  async mostViewed(limit: number, scope: LatestScope): Promise<readonly TopThread[]> {
    return this.topThreads(limit, scope, 'viewCount')
  }

  async mostReplied(limit: number, scope: LatestScope): Promise<readonly TopThread[]> {
    return this.topThreads(limit, scope, 'replyCount')
  }

  private topThreads(
    limit: number,
    scope: LatestScope,
    key: 'viewCount' | 'replyCount',
  ): readonly TopThread[] {
    return visibleThreads(scope)
      .sort((a, b) => b[key] - a[key] || a.id - b.id)
      .slice(0, limit)
      .map((thread) => ({
        threadId: thread.id,
        title: thread.title,
        slug: thread.slug,
        forumId: thread.forumId,
        forumTitle: forums.get(thread.forumId)!.title,
        viewCount: thread.viewCount,
        replyCount: thread.replyCount,
      }))
  }
}
