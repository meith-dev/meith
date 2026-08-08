/**
 * F56 — what a subscription is, and the ports the service and notifier need.
 *
 * The shape follows one decision: **progress is a watermark, not a queue.**
 *
 * Each subscription carries the id of the last post its owner was told about,
 * so "what is outstanding" is a range query rather than a table of pending rows
 * to insert, drain, deduplicate and eventually clean up. That is F06's
 * catch-up rule applied to notification: a tick that never ran, or ran twice,
 * changes *when* somebody is told and never *whether*. A missed week is one
 * larger digest, not a lost one.
 *
 * It also removes a whole class of bug. A pending-rows table has to be written
 * inside the posting transaction — one row per subscriber, on the board's
 * hottest write — and a fan-out that big belongs nowhere near a request.
 */
import type { DigestCadence, SubscriptionMode, SubscriptionTarget } from './modes'

/** One row of the management screen. */
export interface SubscriptionRow {
  readonly target: SubscriptionTarget
  /** Thread id or community id. */
  readonly targetId: number
  readonly title: string
  /** Where the thing itself is. */
  readonly href: string
  readonly mode: SubscriptionMode
  readonly createdAt: Date
  /** How many posts have arrived that this subscriber has not been told about. */
  readonly pending: number
}

/** A post the subscriber has not been told about yet. */
export interface PendingPost {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly communityId: number
  /** Null when the account has been deleted; the name is still shown. */
  readonly authorUsername: string | null
  readonly createdAt: Date
}

/**
 * Everything one member has waiting, on one cadence.
 *
 * Grouped by thread by `buildDigest`, not here: the repository's job is to
 * return rows, and "which thread got the most replies" is a decision about
 * presentation.
 */
export interface PendingForUser {
  readonly userId: number
  readonly posts: readonly PendingPost[]
  /**
   * The highest post id seen, per subscription. Handed straight back to
   * `advanceWatermarks` after the member has been told, so the two cannot
   * disagree about what "told" covered.
   */
  readonly watermarks: readonly {
    readonly target: SubscriptionTarget
    readonly targetId: number
    readonly lastPostId: number
  }[]
}

export interface SubscriptionRepository {
  /**
   * Subscribe, or change an existing subscription's cadence.
   *
   * Idempotent, and **the watermark is only set when the row is created** —
   * re-subscribing to a thread must not silently mark three unread replies as
   * told. Returns false when the target does not exist, which is how the action
   * gives "no such thread" and "not visible to you" the same answer.
   */
  subscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
    readonly mode: SubscriptionMode
    readonly at: Date
  }): Promise<boolean>

  /** Returns false when there was nothing to remove. */
  unsubscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
  }): Promise<boolean>

  /** One member's current mode for one target, or null when not subscribed. */
  modeFor(
    userId: number,
    target: SubscriptionTarget,
    targetId: number,
  ): Promise<SubscriptionMode | null>

  /**
   * The management screen. Scoped to what this member may still see: a community
   * whose permissions changed under them keeps its row invisible rather than
   * naming a private thread back at them.
   */
  listFor(
    userId: number,
    options: { readonly visibleCommunityIds: readonly number[]; readonly limit: number },
  ): Promise<readonly SubscriptionRow[]>

  /**
   * Members with outstanding posts on this cadence, oldest watermark first.
   *
   * `dueBefore` applies to digest cadences only — it is the `digest_runs` clock
   * — and is ignored for `instant`, which is due whenever anything is pending.
   */
  usersWithPending(input: {
    readonly mode: SubscriptionMode
    readonly dueBefore: Date | null
    readonly limit: number
  }): Promise<readonly number[]>

  /**
   * What one member has waiting, filtered to communities they can still see.
   *
   * The visible set is resolved per member by the caller and passed in, because
   * permissions live in `@meith/authorization` and a repository that decided
   * visibility would be the second answer F47 exists to prevent.
   */
  pendingFor(input: {
    readonly userId: number
    readonly mode: SubscriptionMode
    readonly visibleCommunityIds: readonly number[]
    readonly limit: number
  }): Promise<PendingForUser>

  /** Record that these subscriptions have been notified up to these posts. */
  advanceWatermarks(input: {
    readonly userId: number
    readonly watermarks: PendingForUser['watermarks']
  }): Promise<void>

  /** Stamp a member's digest clock for one cadence. */
  recordDigestRun(input: {
    readonly userId: number
    readonly cadence: DigestCadence
    readonly at: Date
  }): Promise<void>
}

/**
 * How the notifier reaches F55.
 *
 * A port rather than the service itself, for D55's reason: the one verb this
 * package needs is "raise this", and handing it `NotificationService` would let
 * a later change mark somebody's notifications read from inside a digest run.
 */
export interface SubscriptionNotifierPort {
  raise(input: {
    readonly userId: number
    readonly kind: 'subscription.reply' | 'subscription.digest'
    readonly data: Record<string, unknown>
    readonly href: string | null
    readonly dedupeKey: string | null
  }): Promise<void>
}

/**
 * Which communities a member may see, resolved by the caller through the Authorizer.
 *
 * The whole permission question in one call. It costs a constant three queries
 * per member (D26) and it is asked once per member per digest run, which is the
 * right place to pay it: the alternative is a notifier that decides visibility
 * itself, and F47's entire argument is that there is exactly one answer to that
 * question and one place it comes from.
 */
export interface VisibleCommunitySource {
  visibleCommunityIdsFor(userId: number): Promise<readonly number[]>
}
