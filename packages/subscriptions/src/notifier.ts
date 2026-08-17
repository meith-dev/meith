import { CADENCE_INTERVAL_MS, type DigestCadence, type SubscriptionMode } from './modes'
import { mintUnsubscribeToken } from './tokens'
import type {
  PendingPost,
  SubscriptionNotifierPort,
  SubscriptionRepository,
  VisibleForumSource,
} from './types'

export const MAX_USERS_PER_RUN = 50

export const MAX_POSTS_PER_USER = 200

export const MAX_THREADS_IN_DIGEST = 10

export interface DigestThread {
  readonly threadId: number
  readonly title: string
  readonly href: string
  readonly posts: number
  readonly lastAuthor: string | null
}

export function groupByThread(posts: readonly PendingPost[]): readonly DigestThread[] {
  const byThread = new Map<number, { thread: PendingPost; count: number; last: PendingPost }>()

  for (const post of posts) {
    const entry = byThread.get(post.threadId)
    if (entry === undefined) {
      byThread.set(post.threadId, { thread: post, count: 1, last: post })
      continue
    }
    entry.count += 1
    if (post.postId > entry.last.postId) entry.last = post
  }

  return [...byThread.values()]
    .sort((a, b) => b.count - a.count || a.thread.threadId - b.thread.threadId)
    .map(({ thread, count, last }) => ({
      threadId: thread.threadId,
      title: thread.threadTitle,
      href: `/thread/${thread.threadId}-${thread.threadSlug}?after=${thread.postId - 1}`,
      posts: count,
      lastAuthor: last.authorUsername,
    }))
}

export interface RunOutcome {
  readonly notified: number
  readonly considered: number
}

export class SubscriptionNotifier {
  private readonly subscriptions: SubscriptionRepository
  private readonly notifications: SubscriptionNotifierPort
  private readonly forums: VisibleForumSource
  private readonly now: () => Date

  private readonly secret: string | null

  constructor(deps: {
    subscriptions: SubscriptionRepository
    notifications: SubscriptionNotifierPort
    forums: VisibleForumSource
    unsubscribeSecret?: string | null
    now?: () => Date
  }) {
    this.subscriptions = deps.subscriptions
    this.notifications = deps.notifications
    this.forums = deps.forums
    this.secret = deps.unsubscribeSecret ?? null
    this.now = deps.now ?? (() => new Date())
  }

  private token(
    userId: number,
    scope: 'thread' | 'forum' | 'email',
    targetId: number,
  ): string | null {
    return this.secret === null
      ? null
      : mintUnsubscribeToken({ userId, scope, targetId }, this.secret)
  }

  async runInstant(limit = MAX_USERS_PER_RUN): Promise<RunOutcome> {
    return this.run('instant', null, limit, (userId, threads) =>
      Promise.all(
        threads.map((thread) =>
          this.notifications.raise({
            userId,
            kind: 'subscription.reply',
            data: {
              threadTitle: thread.title,
              posts: thread.posts,
              lastAuthor: thread.lastAuthor,
              unsubscribe: this.token(userId, 'thread', thread.threadId),
            },
            href: thread.href,
            dedupeKey: `subscription.reply:${thread.threadId}`,
          }),
        ),
      ).then(() => undefined),
    )
  }

  async runDigest(cadence: DigestCadence, limit = MAX_USERS_PER_RUN): Promise<RunOutcome> {
    const at = this.now()
    const dueBefore = new Date(at.getTime() - CADENCE_INTERVAL_MS[cadence])

    return this.run(cadence, dueBefore, limit, async (userId, threads) => {
      const totalPosts = threads.reduce((sum, thread) => sum + thread.posts, 0)

      await this.notifications.raise({
        userId,
        kind: 'subscription.digest',
        data: {
          cadence,
          threadCount: threads.length,
          postCount: totalPosts,
          threads: threads.slice(0, MAX_THREADS_IN_DIGEST).map((thread) => ({
            title: thread.title,
            href: thread.href,
            posts: thread.posts,
            lastAuthor: thread.lastAuthor,
          })),
          more: Math.max(0, threads.length - MAX_THREADS_IN_DIGEST),
          unsubscribe: this.token(userId, 'email', 0),
        },
        href: '/subscriptions',
        dedupeKey: null,
      })

      await this.subscriptions.recordDigestRun({ userId, cadence, at })
    })
  }

  private async run(
    mode: SubscriptionMode,
    dueBefore: Date | null,
    limit: number,
    tell: (userId: number, threads: readonly DigestThread[]) => Promise<void>,
  ): Promise<RunOutcome> {
    const users = await this.subscriptions.usersWithPending({ mode, dueBefore, limit })

    let notified = 0
    for (const userId of users) {
      try {
        const visibleForumIds = await this.forums.visibleForumIdsFor(userId)
        const pending = await this.subscriptions.pendingFor({
          userId,
          mode,
          visibleForumIds,
          limit: MAX_POSTS_PER_USER,
        })

        const threads = groupByThread(pending.posts)
        if (threads.length > 0) {
          await tell(userId, threads)
          notified += 1
        }

        if (pending.watermarks.length > 0) {
          await this.subscriptions.advanceWatermarks({
            userId,
            watermarks: pending.watermarks,
          })
        }
      } catch {
        /* ignore */
      }
    }

    return { notified, considered: users.length }
  }
}
