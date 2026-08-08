/**
 * F56 — turning outstanding posts into notifications.
 *
 * **One runner, three cadences.** Instant, daily and weekly differ only in how
 * often the task that calls this fires and in how the result is grouped; the
 * work — find members with outstanding posts, filter to what they may still
 * see, tell them, advance the watermark — is identical. Writing them as three
 * code paths would mean three places for the watermark to be advanced wrongly,
 * and the watermark is the one thing here that must never be wrong: advancing
 * it without telling anybody loses a notification permanently.
 *
 * ## "Instant" means "within a tick"
 *
 * Nothing here runs inside the posting request. A reply that fanned out to its
 * subscribers inline would put an unbounded loop — one iteration per subscriber,
 * each needing a permission check — on the board's hottest write, and couple
 * posting to the mail provider being up. So instant is a task on the shortest
 * interval the scheduler runs (F06), and the honest description of it is "at
 * most a tick behind", which `mybb-parity.md` records rather than glossing.
 *
 * ## Permission is re-checked at notify time, per member
 *
 * A subscription is not a standing grant. A community can be made private, a group
 * can lose `canView`, a thread can be moved somewhere the subscriber cannot
 * read — all after the subscription was created, and all of them mean the
 * member must not be told what happened there. The visible set is resolved
 * through the Authorizer per member (`VisibleCommunitySource`), which costs a
 * constant three queries each (D26) and is the only way this stays consistent
 * with every other read on the board.
 *
 * The watermark still advances for content the member may no longer see. That
 * is deliberate: the alternative is a subscription that accumulates an
 * ever-growing backlog of posts nobody will ever be shown, and re-granting
 * access later would then deliver a year of history in one digest.
 */
import { CADENCE_INTERVAL_MS, type DigestCadence, type SubscriptionMode } from './modes'
import { mintUnsubscribeToken } from './tokens'
import type {
  PendingPost,
  SubscriptionNotifierPort,
  SubscriptionRepository,
  VisibleCommunitySource,
} from './types'

/** Members processed in one run. Bounded for the same reason every task is. */
export const MAX_USERS_PER_RUN = 50

/** Outstanding posts read per member. A digest lists threads, not every post. */
export const MAX_POSTS_PER_USER = 200

/** Threads named in one digest notification. The rest become "and N others". */
export const MAX_THREADS_IN_DIGEST = 10

/** One thread's worth of outstanding posts, as a notification describes it. */
export interface DigestThread {
  readonly threadId: number
  readonly title: string
  readonly href: string
  readonly posts: number
  /** Who wrote the most recent one. Null when that account has gone. */
  readonly lastAuthor: string | null
}

/**
 * Group outstanding posts by thread, busiest first.
 *
 * Exported and pure so the interesting part — what a member is actually shown —
 * is testable without a database, a queue or a clock.
 */
export function groupByThread(posts: readonly PendingPost[]): readonly DigestThread[] {
  const byThread = new Map<number, { thread: PendingPost; count: number; last: PendingPost }>()

  for (const post of posts) {
    const entry = byThread.get(post.threadId)
    if (entry === undefined) {
      byThread.set(post.threadId, { thread: post, count: 1, last: post })
      continue
    }
    entry.count += 1
    /* Rows arrive in id order per thread, but do not rely on it. */
    if (post.postId > entry.last.postId) entry.last = post
  }

  return [...byThread.values()]
    .sort((a, b) => b.count - a.count || a.thread.threadId - b.thread.threadId)
    .map(({ thread, count, last }) => ({
      threadId: thread.threadId,
      title: thread.threadTitle,
      /* Deep-linked to the first post they have not seen, not to page one. */
      href: `/thread/${thread.threadId}-${thread.threadSlug}?after=${thread.postId - 1}`,
      posts: count,
      lastAuthor: last.authorUsername,
    }))
}

export interface RunOutcome {
  /** Members told about something. */
  readonly notified: number
  /** Members looked at. Larger than `notified` when everything was filtered. */
  readonly considered: number
}

export class SubscriptionNotifier {
  private readonly subscriptions: SubscriptionRepository
  private readonly notifications: SubscriptionNotifierPort
  private readonly communities: VisibleCommunitySource
  private readonly now: () => Date

  private readonly secret: string | null

  constructor(deps: {
    subscriptions: SubscriptionRepository
    notifications: SubscriptionNotifierPort
    communities: VisibleCommunitySource
    /**
     * Signs the unsubscribe links (F56's no-login route). Optional: a board
     * with no `AUTH_SECRET` still notifies, its messages just carry no
     * one-click link — an unsigned one would be an unsubscribe endpoint that
     * takes a user id in a query string.
     */
    unsubscribeSecret?: string | null
    now?: () => Date
  }) {
    this.subscriptions = deps.subscriptions
    this.notifications = deps.notifications
    this.communities = deps.communities
    this.secret = deps.unsubscribeSecret ?? null
    this.now = deps.now ?? (() => new Date())
  }

  /** The token an e-mail's unsubscribe link carries, or null when unsigned. */
  private token(userId: number, scope: 'thread' | 'community' | 'email', targetId: number): string | null {
    return this.secret === null
      ? null
      : mintUnsubscribeToken({ userId, scope, targetId }, this.secret)
  }

  /**
   * The `subscriptions.instant` task.
   *
   * One notification **per thread**, carrying F55's dedupe key, so five replies
   * to the same thread while the member has not read the notification are one
   * row with a count on it rather than five — and one e-mail rather than five.
   * That is precisely what F55 built coalescing for, and it is why instant mode
   * does not need its own batching rule.
   */
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
              /*
               * The link that ends *this* subscription, signed. Carried in the
               * notification rather than minted at delivery because the mail
               * job knows a notification id and nothing about subscriptions —
               * and because a token stored beside the thing it unsubscribes
               * cannot come to refer to a different one.
               */
              unsubscribe: this.token(userId, 'thread', thread.threadId),
            },
            href: thread.href,
            /*
             * Per thread, so two threads are two notifications and five replies
             * to one thread are one. Cleared when the member reads it, which is
             * what makes the next reply a fresh notification rather than
             * silence.
             */
            dedupeKey: `subscription.reply:${thread.threadId}`,
          }),
        ),
      ).then(() => undefined),
    )
  }

  /**
   * The `subscriptions.digest` task, for one cadence.
   *
   * One notification per member per run, listing threads rather than posts —
   * that is the whole difference between a digest and instant mode. The clock
   * is per member (`digest_runs`), so a member who subscribed on Sunday gets
   * their first weekly digest a week later rather than at whatever moment the
   * board's tick happened to fire.
   */
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
          /*
           * A bounded list: a member following forty active threads gets the
           * ten busiest named and a count for the rest, because a digest that
           * lists everything is the thing people unsubscribe from.
           */
          threads: threads.slice(0, MAX_THREADS_IN_DIGEST).map((thread) => ({
            title: thread.title,
            href: thread.href,
            posts: thread.posts,
            lastAuthor: thread.lastAuthor,
          })),
          more: Math.max(0, threads.length - MAX_THREADS_IN_DIGEST),
          /*
           * Board-wide, not per subscription: a digest covers many threads, so
           * "unsubscribe" cannot mean one of them — and ending all of somebody's
           * subscriptions because they wanted fewer e-mails would delete their
           * follow list. This one switches subscription e-mail off and leaves
           * every subscription and its on-site notification in place.
           */
          unsubscribe: this.token(userId, 'email', 0),
        },
        href: '/subscriptions',
        /*
         * No dedupe key. Two digests are two periods, and collapsing this
         * week's into last week's unread one would silently drop a week.
         */
        dedupeKey: null,
      })

      await this.subscriptions.recordDigestRun({ userId, cadence, at })
    })
  }

  /**
   * The shape both cadences share.
   *
   * One member failing does not abandon the rest: a digest run that threw
   * halfway would advance nobody's watermark, retry the same member on the next
   * tick, and never reach the members behind them.
   */
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
        const visibleCommunityIds = await this.communities.visibleCommunityIdsFor(userId)
        const pending = await this.subscriptions.pendingFor({
          userId,
          mode,
          visibleCommunityIds,
          limit: MAX_POSTS_PER_USER,
        })

        const threads = groupByThread(pending.posts)
        if (threads.length > 0) {
          await tell(userId, threads)
          notified += 1
        }

        /*
         * Advanced *after* the notification, and advanced even when there was
         * nothing to say — a member who can no longer see the community has been
         * caught up as far as this run looked, and must not accumulate a
         * backlog that would arrive in one piece if access came back.
         *
         * The ordering costs a duplicate notification if the process dies in
         * between, which is the right way round: F55's coalescing absorbs a
         * repeat, and nothing absorbs a loss.
         */
        if (pending.watermarks.length > 0) {
          await this.subscriptions.advanceWatermarks({
            userId,
            watermarks: pending.watermarks,
          })
        }
      } catch {
        /* Deliberately swallowed; see the doc comment. */
      }
    }

    return { notified, considered: users.length }
  }
}
