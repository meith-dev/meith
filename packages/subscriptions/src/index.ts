/**
 * `@meith/subscriptions` — F56.
 *
 * Following a thread or a forum, and being told about what arrives in it. The
 * two tables this reads have existed since migration `0000` and were written by
 * F39's composer checkbox since Phase 3; nothing has ever read one until now.
 *
 * Three things live here: the cadence a subscription carries (F55 owns the
 * *channel*, so this owns only *how often*), the runner that turns outstanding
 * posts into F55 notifications, and the stateless token behind an unsubscribe
 * link that works without logging in.
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next, no driver
 * implementations.
 */
export {
  SUBSCRIPTION_MODES,
  DIGEST_CADENCES,
  CADENCE_INTERVAL_MS,
  MODE_LABELS,
  isDigestCadence,
  parseSubscriptionMode,
  parseSubscriptionTarget,
  type DigestCadence,
  type SubscriptionMode,
  type SubscriptionTarget,
} from './modes'

export {
  SubscriptionService,
  SUBSCRIPTIONS_PAGE_SIZE,
} from './service'

export {
  SubscriptionNotifier,
  groupByThread,
  MAX_POSTS_PER_USER,
  MAX_THREADS_IN_DIGEST,
  MAX_USERS_PER_RUN,
  type DigestThread,
  type RunOutcome,
} from './notifier'

export {
  mintUnsubscribeToken,
  readUnsubscribeToken,
  type UnsubscribeClaim,
} from './tokens'

export type {
  PendingForUser,
  PendingPost,
  SubscriptionNotifierPort,
  SubscriptionRepository,
  SubscriptionRow,
  VisibleForumSource,
} from './types'
