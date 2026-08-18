import type { TaskDefinition } from './types'

export interface TaskWorkers {
  relayOutbox(batchSize: number): Promise<number>
  deliverWebhooks(batchSize: number): Promise<{
    readonly attempted: number
    readonly delivered: number
    readonly retried: number
    readonly dead: number
  }>
  drainQueue(batchSize: number, signal: AbortSignal): Promise<number>
  pruneSessions(): Promise<number>
  pruneExpiredTokens(): Promise<number>
  pruneRateLimits(): Promise<number>
  reconcileCounters(batchSize: number): Promise<number>
  flushThreadViews(batchSize: number): Promise<number>
  backfillPostRenders(batchSize: number): Promise<number>
  reindexSearch(batchSize: number): Promise<number>
  applyPromotions(batchSize: number): Promise<number>
  expireBans(batchSize: number): Promise<number>
  expireGroupMemberships(batchSize: number): Promise<number>
  expireWarnings(batchSize: number): Promise<number>
  notifySubscribers(batchSize: number, signal: AbortSignal): Promise<number>
  sendDigests(batchSize: number, signal: AbortSignal): Promise<number>
  sweepAttachments(batchSize: number): Promise<{ deleted: number; failed: number }>
  sweepAvatars(batchSize: number): Promise<number>
  rollUpStatistics(): Promise<{ memberCount: number; online: number; record: boolean }>
}

function allDefinitions(workers: TaskWorkers): TaskDefinition[] {
  return [
    {
      id: 'outbox.relay',
      title: 'Relay domain events',
      titleKey: 'adminSystem.task.outboxRelay.title',
      description:
        'Moves committed events from the outbox onto the queue. Runs most ' +
        'frequently because user-visible side effects (notifications, search ' +
        'indexing) wait on it.',
      descriptionKey: 'adminSystem.task.outboxRelay.description',
      intervalSeconds: 60,
      maxDurationSeconds: 30,
      async run() {
        const relayed = await workers.relayOutbox(200)
        return { detail: { relayed } }
      },
    },

    {
      id: 'webhooks.deliver',
      title: 'Deliver queued webhooks',
      titleKey: 'adminSystem.task.webhooksDeliver.title',
      description:
        'Sends pending webhook deliveries to their subscribers, then records ' +
        'each verdict: delivered, retried with backoff, or dead-lettered.',
      descriptionKey: 'adminSystem.task.webhooksDeliver.description',
      intervalSeconds: 60,
      maxDurationSeconds: 240,
      async run() {
        const result = await workers.deliverWebhooks(20)
        return { detail: { ...result } }
      },
    },

    {
      id: 'queue.drain',
      title: 'Process queued jobs',
      titleKey: 'adminSystem.task.queueDrain.title',
      description:
        'Executes due jobs. Bounded per run: a large backlog is drained across ' +
        'several ticks rather than risking a function timeout mid-job. Stops ' +
        'between jobs when its budget is spent, handing back the jobs it did ' +
        'not reach.',
      descriptionKey: 'adminSystem.task.queueDrain.description',
      intervalSeconds: 60,
      maxDurationSeconds: 45,
      async run({ signal }) {
        const processed = await workers.drainQueue(50, signal)
        return { detail: { processed } }
      },
    },

    {
      id: 'sessions.prune',
      title: 'Prune idle sessions',
      titleKey: 'adminSystem.task.sessionsPrune.title',
      description:
        'Deletes sessions past the idle timeout. Purely subtractive, so running ' +
        'it twice removes nothing extra.',
      descriptionKey: 'adminSystem.task.sessionsPrune.description',
      intervalSeconds: 3600,
      maxDurationSeconds: 30,
      async run() {
        const removed = await workers.pruneSessions()
        return { detail: { removed } }
      },
    },

    {
      id: 'tokens.prune',
      title: 'Prune expired tokens',
      titleKey: 'adminSystem.task.tokensPrune.title',
      description: 'Clears spent activation and password-reset tokens.',
      descriptionKey: 'adminSystem.task.tokensPrune.description',
      intervalSeconds: 3600,
      maxDurationSeconds: 30,
      async run() {
        const removed = await workers.pruneExpiredTokens()
        return { detail: { removed } }
      },
    },

    {
      id: 'ratelimits.prune',
      title: 'Prune rate-limit counters',
      titleKey: 'adminSystem.task.rateLimitsPrune.title',
      description:
        'Drops anti-spam counters whose window has passed. They are bookkeeping ' +
        'and grow with traffic rather than with content, so nothing is lost and ' +
        'a busy board would otherwise keep a row per member per hour forever.',
      descriptionKey: 'adminSystem.task.rateLimitsPrune.description',
      intervalSeconds: 3600,
      maxDurationSeconds: 30,
      async run() {
        const removed = await workers.pruneRateLimits()
        return { detail: { removed } }
      },
    },

    {
      id: 'counters.reconcile',
      title: 'Reconcile denormalised counters',
      titleKey: 'adminSystem.task.countersReconcile.title',
      description:
        'Recomputes forum and thread counters from source rows. Counters are ' +
        'maintained incrementally on the write path for speed; this is the ' +
        'safety net that repairs drift from a crashed request or a bad import. ' +
        'Idempotent by construction — it writes a computed truth, not a delta.',
      descriptionKey: 'adminSystem.task.countersReconcile.description',
      intervalSeconds: 21_600,
      maxDurationSeconds: 60,
      async run() {
        const corrected = await workers.reconcileCounters(500)
        return { detail: { corrected } }
      },
    },

    {
      id: 'views.flush',
      title: 'Flush buffered thread views',
      titleKey: 'adminSystem.task.viewsFlush.title',
      description:
        'Applies buffered view counts to their threads. Views are buffered on ' +
        'the write path so a busy thread does not rewrite the row behind the ' +
        'listing index on every page view; this is where they land. Bounded, ' +
        'and a skipped run only delays the numbers.',
      descriptionKey: 'adminSystem.task.viewsFlush.description',
      intervalSeconds: 300,
      maxDurationSeconds: 30,
      async run() {
        const flushed = await workers.flushThreadViews(500)
        return { detail: { flushed } }
      },
    },

    {
      id: 'posts.render_backfill',
      title: 'Re-render stale post bodies',
      titleKey: 'adminSystem.task.postsRenderBackfill.title',
      description:
        'Rewrites the stored HTML of posts rendered by an older version of the ' +
        'renderer, and converts any body still stored as BBCode. A stale render ' +
        'is rendered live on read, so this never gates correctness — it stops a renderer ' +
        'change, or an import that wrote none, from making every thread page ' +
        'pay for it. Idempotent, and its own progress marker is the row.',
      descriptionKey: 'adminSystem.task.postsRenderBackfill.description',
      intervalSeconds: 600,
      maxDurationSeconds: 45,
      async run() {
        const rendered = await workers.backfillPostRenders(200)
        return { detail: { rendered } }
      },
    },

    {
      id: 'search.reindex',
      title: 'Build the search index for posts that have none',
      titleKey: 'adminSystem.task.searchReindex.title',
      description:
        'Writes the search document for posts that were never indexed, or were ' +
        'indexed under an older definition of it. The write path indexes every post ' +
        'it creates, so this is only ever a catch-up: an import, a seeded board, a ' +
        'board adopting search, or a release that changed what the document holds.',
      descriptionKey: 'adminSystem.task.searchReindex.description',
      intervalSeconds: 600,
      maxDurationSeconds: 45,
      async run() {
        const indexed = await workers.reindexSearch(200)
        return { detail: { indexed } }
      },
    },

    {
      id: 'promotions.apply',
      title: 'Apply group promotions',
      titleKey: 'adminSystem.task.promotionsApply.title',
      description:
        'Moves users into groups whose promotion criteria they now meet. ' +
        'Evaluates current post counts and registration age rather than tracking ' +
        'thresholds crossed, so a missed run catches up on the next tick.',
      descriptionKey: 'adminSystem.task.promotionsApply.description',
      intervalSeconds: 21_600,
      maxDurationSeconds: 60,
      async run() {
        const promoted = await workers.applyPromotions(500)
        return { detail: { promoted } }
      },
    },

    {
      id: 'bans.expire',
      title: 'Expire temporary bans',
      titleKey: 'adminSystem.task.bansExpire.title',
      description:
        'Lifts bans whose expiry has passed, restoring each user to the group ' +
        'they held when banned. Acts on outstanding state rather than on what ' +
        'expired since the last run, so a skipped day costs a delay and nothing ' +
        'else, and a doubled tick lifts nothing twice.',
      descriptionKey: 'adminSystem.task.bansExpire.description',
      intervalSeconds: 900,
      maxDurationSeconds: 30,
      async run() {
        const lifted = await workers.expireBans(200)
        return { detail: { lifted } }
      },
    },

    {
      id: 'groups.expire',
      title: 'Expire timed group memberships',
      titleKey: 'adminSystem.task.groupsExpire.title',
      description:
        'Deletes secondary group memberships whose expiry has passed and bumps ' +
        'the permission version so derived caches follow. Actor assembly already ' +
        'excludes a lapsed row, so access ended on time regardless — this tidies ' +
        'the table rather than enforcing the boundary, and a doubled tick ' +
        'deletes nothing twice.',
      descriptionKey: 'adminSystem.task.groupsExpire.description',
      intervalSeconds: 900,
      maxDurationSeconds: 30,
      async run() {
        const removed = await workers.expireGroupMemberships(200)
        return { detail: { removed } }
      },
    },

    {
      id: 'warnings.expire',
      title: 'Expire warnings',
      titleKey: 'adminSystem.task.warningsExpire.title',
      description:
        'Recomputes the points total of every member whose cached total still ' +
        'counts a warning that has passed its expiry date, and re-evaluates the ' +
        'restriction their level implies — which is how a suspension ends when ' +
        'the warning behind it ages out. The live-warning predicate already ' +
        'excludes an expired row, so this corrects the cache rather than ' +
        'creating truth: a board whose tick has been down still reports honest ' +
        'totals the moment anything recalculates.',
      descriptionKey: 'adminSystem.task.warningsExpire.description',
      intervalSeconds: 3_600,
      maxDurationSeconds: 60,
      async run() {
        const expired = await workers.expireWarnings(200)
        return { detail: { expired } }
      },
    },
    {
      id: 'subscriptions.instant',
      title: 'Notify subscribers',
      titleKey: 'adminSystem.task.subscriptionsInstant.title',
      description:
        'Tells members who follow a thread or forum "as it happens" about ' +
        'posts that have arrived since they were last told. Runs on the ' +
        'shortest interval the scheduler has, which is what "instant" means ' +
        'here: fanning out inside the posting request would put an unbounded ' +
        "loop — one permission check per subscriber — on the board's hottest " +
        'write, and couple posting to the mail provider being up. Each ' +
        'subscription carries a watermark, so a skipped tick delays a ' +
        'notification and never loses one — which is also what lets it stop ' +
        'between members when its budget is spent.',
      descriptionKey: 'adminSystem.task.subscriptionsInstant.description',
      intervalSeconds: 60,
      maxDurationSeconds: 45,
      async run({ signal }) {
        const notified = await workers.notifySubscribers(50, signal)
        return { detail: { notified } }
      },
    },

    {
      id: 'subscriptions.digest',
      title: 'Send subscription digests',
      titleKey: 'adminSystem.task.subscriptionsDigest.title',
      description:
        'Sends the daily and weekly digests that are due. The clock is per ' +
        'member and per cadence rather than per run, so somebody who ' +
        'subscribed on Sunday gets their first weekly digest a week later — ' +
        'not at whatever moment the board tick happened to fire. Hourly, ' +
        'because a digest that is due is a query that finds nobody most of the ' +
        'time, and asking often is what keeps "daily" within an hour of the ' +
        'same time each day.',
      descriptionKey: 'adminSystem.task.subscriptionsDigest.description',
      intervalSeconds: 3_600,
      maxDurationSeconds: 60,
      async run({ signal }) {
        const notified = await workers.sendDigests(50, signal)
        return { detail: { notified } }
      },
    },

    {
      id: 'attachments.sweep',
      title: 'Collect abandoned attachment files',
      titleKey: 'adminSystem.task.attachmentsSweep.title',
      description:
        'Deletes objects in the file store that nothing owns, and fails ' +
        'uploads whose re-encoding never finished. An object key is recorded ' +
        'before its bytes are written and forgotten when a row takes ownership, ' +
        'so what this collects is exactly what a crash between those two steps ' +
        'left behind — a question that is an indexed query here and a full ' +
        'bucket listing anywhere else. Purely subtractive, and bounded by a ' +
        'grace period, so an upload in flight is never collected out from ' +
        'under itself.',
      descriptionKey: 'adminSystem.task.attachmentsSweep.description',
      intervalSeconds: 3_600,
      maxDurationSeconds: 60,
      async run() {
        const { deleted, failed } = await workers.sweepAttachments(200)
        return { detail: { deleted, failed } }
      },
    },

    {
      id: 'avatars.sweep',
      title: 'Fail unfinished avatar uploads',
      titleKey: 'adminSystem.task.avatarsSweep.title',
      description:
        'Marks avatar uploads whose re-encode never finished, so the member is ' +
        'told to try again rather than left looking at a spinner that is not ' +
        'there. Separate from the attachment sweep because it acts on `users` ' +
        'rather than on the object ledger, and because an operator asking why ' +
        'an avatar is stuck should not have to read a task about attachments. ' +
        'Purely corrective, and safe to run twice.',
      descriptionKey: 'adminSystem.task.avatarsSweep.description',
      intervalSeconds: 3_600,
      maxDurationSeconds: 60,
      async run() {
        const failed = await workers.sweepAvatars(200)
        return { detail: { failed } }
      },
    },

    {
      id: 'stats.rollup',
      title: 'Roll up board statistics',
      titleKey: 'adminSystem.task.statsRollup.title',
      description:
        'Recomputes the board totals shown on the index and raises the ' +
        '"most ever online" record when the current count has beaten it. The ' +
        'totals are computed here rather than per page view because the member ' +
        'count is a count of `users`, and the index is the most-requested page ' +
        'on the board. The page shows when this last ran, so a number ten ' +
        'minutes old is honest rather than wrong. Writes a computed truth, not ' +
        'a delta, so a skipped tick costs freshness and a doubled one costs ' +
        'nothing.',
      descriptionKey: 'adminSystem.task.statsRollup.description',
      intervalSeconds: 300,
      maxDurationSeconds: 30,
      async run() {
        const { memberCount, online, record } = await workers.rollUpStatistics()
        return { detail: { memberCount, online, record: record ? 1 : 0 } }
      },
    },
  ]
}

const REQUIRED_WORKER: Readonly<Record<string, keyof TaskWorkers>> = {
  'outbox.relay': 'relayOutbox',
  'webhooks.deliver': 'deliverWebhooks',
  'queue.drain': 'drainQueue',
  'sessions.prune': 'pruneSessions',
  'tokens.prune': 'pruneExpiredTokens',
  'ratelimits.prune': 'pruneRateLimits',
  'counters.reconcile': 'reconcileCounters',
  'views.flush': 'flushThreadViews',
  'posts.render_backfill': 'backfillPostRenders',
  'search.reindex': 'reindexSearch',
  'promotions.apply': 'applyPromotions',
  'bans.expire': 'expireBans',
  'groups.expire': 'expireGroupMemberships',
  'warnings.expire': 'expireWarnings',
  'subscriptions.instant': 'notifySubscribers',
  'subscriptions.digest': 'sendDigests',
  'attachments.sweep': 'sweepAttachments',
  'avatars.sweep': 'sweepAvatars',
  'stats.rollup': 'rollUpStatistics',
}

export function builtinTasks(workers: Partial<TaskWorkers>): TaskDefinition[] {
  const supplied = workers as TaskWorkers
  return allDefinitions(supplied).filter(
    (task) => typeof supplied[REQUIRED_WORKER[task.id] as keyof TaskWorkers] === 'function',
  )
}
