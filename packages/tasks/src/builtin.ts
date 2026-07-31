/**
 * F06 — the built-in catch-up tasks.
 *
 * Each takes its dependencies as arguments so the same definition can run
 * against Postgres or the fixture. Note none of them look at the wall clock to
 * decide *what* to do — they read outstanding state, which is what makes a
 * skipped or doubled tick harmless.
 */

import type { TaskDefinition } from './types'

/** Work each task delegates to. Implemented in the app layer over @forum/db. */
export interface TaskWorkers {
  /** Moves committed outbox rows onto the queue. Returns rows relayed. */
  relayOutbox(batchSize: number): Promise<number>
  /** Runs due queue jobs. Returns jobs processed. */
  drainQueue(batchSize: number): Promise<number>
  /** Deletes sessions idle past the configured timeout. Returns rows removed. */
  pruneSessions(): Promise<number>
  /** Clears expired activation/reset tokens. Returns rows removed. */
  pruneExpiredTokens(): Promise<number>
  /** Recomputes drifted forum/thread counters. Returns rows corrected. */
  reconcileCounters(batchSize: number): Promise<number>
  /** Folds buffered thread views into `threads.view_count`. Returns threads updated. */
  flushThreadViews(batchSize: number): Promise<number>
  /** Re-renders posts left on an older BBCode renderer. Returns posts rewritten. */
  backfillPostRenders(batchSize: number): Promise<number>
  /** Promotes users who now meet a promotion rule. Returns users moved. */
  applyPromotions(batchSize: number): Promise<number>
  /** Lifts bans whose expiry has passed, restoring each user's prior group. */
  expireBans(batchSize: number): Promise<number>
  /**
   * Lapses warnings whose expiry has passed and re-evaluates the members they
   * belonged to. Returns warnings lapsed.
   */
  expireWarnings(batchSize: number): Promise<number>
}

function allDefinitions(workers: TaskWorkers): TaskDefinition[] {
  return [
    {
      id: 'outbox.relay',
      title: 'Relay domain events',
      description:
        'Moves committed events from the outbox onto the queue. Runs most ' +
        'frequently because user-visible side effects (notifications, search ' +
        'indexing) wait on it.',
      intervalSeconds: 60,
      maxDurationSeconds: 30,
      async run() {
        const relayed = await workers.relayOutbox(200)
        return { detail: { relayed } }
      },
    },

    {
      id: 'queue.drain',
      title: 'Process queued jobs',
      description:
        'Executes due jobs. Bounded per run: a large backlog is drained across ' +
        'several ticks rather than risking a function timeout mid-job.',
      intervalSeconds: 60,
      maxDurationSeconds: 45,
      async run() {
        const processed = await workers.drainQueue(50)
        return { detail: { processed } }
      },
    },

    {
      id: 'sessions.prune',
      title: 'Prune idle sessions',
      description:
        'Deletes sessions past the idle timeout. Purely subtractive, so running ' +
        'it twice removes nothing extra.',
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
      description: 'Clears spent activation and password-reset tokens.',
      intervalSeconds: 3600,
      maxDurationSeconds: 30,
      async run() {
        const removed = await workers.pruneExpiredTokens()
        return { detail: { removed } }
      },
    },

    {
      id: 'counters.reconcile',
      title: 'Reconcile denormalised counters',
      description:
        'Recomputes forum and thread counters from source rows. Counters are ' +
        'maintained incrementally on the write path for speed; this is the ' +
        'safety net that repairs drift from a crashed request or a bad import. ' +
        'Idempotent by construction — it writes a computed truth, not a delta.',
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
      description:
        'Applies buffered view counts to their threads. Views are buffered on ' +
        'the write path so a busy thread does not rewrite the row behind the ' +
        'listing index on every page view; this is where they land. Bounded, ' +
        'and a skipped run only delays the numbers.',
      /*
       * Five minutes is a view count being wrong by at most five minutes, which
       * nobody can observe, against one `threads` update per thread per five
       * minutes instead of one per reader.
       */
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
      description:
        'Rewrites the stored HTML of posts rendered by an older version of the ' +
        'BBCode renderer. Purely an optimisation: a stale render is rendered ' +
        'live on read, so this never gates correctness — it stops a renderer ' +
        'change, or an import that wrote none, from making every thread page ' +
        'pay for it. Idempotent, and its own progress marker is the row.',
      /*
       * Ten minutes. The work only exists after a deploy that bumps the
       * renderer version or an import, so on a settled board this is a query
       * that finds nothing — one index seek, which is why it can afford to ask
       * often enough that a version bump is caught up within the hour.
       */
      intervalSeconds: 600,
      maxDurationSeconds: 45,
      async run() {
        const rendered = await workers.backfillPostRenders(200)
        return { detail: { rendered } }
      },
    },

    {
      id: 'promotions.apply',
      title: 'Apply group promotions',
      description:
        'Moves users into groups whose promotion criteria they now meet. ' +
        'Evaluates current post counts and registration age rather than tracking ' +
        'thresholds crossed, so a missed run catches up on the next tick.',
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
      description:
        'Lifts bans whose expiry has passed, restoring each user to the group ' +
        'they held when banned. Acts on outstanding state rather than on what ' +
        'expired since the last run, so a skipped day costs a delay and nothing ' +
        'else, and a doubled tick lifts nothing twice.',
      /*
       * Every fifteen minutes rather than hourly: a ban is a *punishment with a
       * stated end*, and a user still locked out an hour after their ban expired
       * reasonably concludes it did not work. Cheap — the query is an index scan
       * over unlifted bans with a past expiry, which is almost always empty.
       */
      intervalSeconds: 900,
      maxDurationSeconds: 30,
      async run() {
        const lifted = await workers.expireBans(200)
        return { detail: { lifted } }
      },
    },

    {
      id: 'warnings.expire',
      title: 'Expire warnings',
      description:
        "Recomputes the points total of every member whose cached total still " +
        'counts a warning that has passed its expiry date, and re-evaluates the ' +
        'restriction their level implies — which is how a suspension ends when ' +
        'the warning behind it ages out. The live-warning predicate already ' +
        'excludes an expired row, so this corrects the cache rather than ' +
        'creating truth: a board whose tick has been down still reports honest ' +
        'totals the moment anything recalculates.',
      /*
       * Hourly rather than every fifteen minutes, unlike `bans.expire`. A ban
       * is a lockout with a stated end and an hour of overrun is a complaint; a
       * warning expiring is a restriction quietly lifting, and nobody is
       * sitting watching the clock for it. The query is an index scan over
       * unrevoked warnings with a past expiry, which is almost always empty.
       */
      intervalSeconds: 3_600,
      maxDurationSeconds: 60,
      async run() {
        const expired = await workers.expireWarnings(200)
        return { detail: { expired } }
      },
    },
  ]
}

/**
 * Which worker each task needs.
 *
 * A task is only registered when its worker is supplied — see `builtinTasks`.
 */
const REQUIRED_WORKER: Readonly<Record<string, keyof TaskWorkers>> = {
  'outbox.relay': 'relayOutbox',
  'queue.drain': 'drainQueue',
  'sessions.prune': 'pruneSessions',
  'tokens.prune': 'pruneExpiredTokens',
  'counters.reconcile': 'reconcileCounters',
  'views.flush': 'flushThreadViews',
  'posts.render_backfill': 'backfillPostRenders',
  'promotions.apply': 'applyPromotions',
  'bans.expire': 'expireBans',
  'warnings.expire': 'expireWarnings',
}

/**
 * The built-in tasks whose workers actually exist.
 *
 * Takes a *partial* worker set and registers only what can run. A worker whose
 * feature does not exist yet is simply absent, and the alternatives are both
 * worse than filtering:
 *
 *  - a stub returning 0 pretends work happened, and the tick would report a
 *    healthy run of a task that does nothing;
 *  - a stub that throws makes every tick log a failure and eventually raises an
 *    admin notification for a task nobody asked for.
 *
 * Not registering it means `tasks` holds no row for it, System Health does not
 * list it, and the day its worker exists it appears on its own — which is how
 * `counters.reconcile` and `outbox.relay` arrived with F38. This is the same
 * rule the operator CLI follows by omitting commands it cannot honour: never
 * advertise a capability that is not there.
 */
export function builtinTasks(workers: Partial<TaskWorkers>): TaskDefinition[] {
  const supplied = workers as TaskWorkers
  return allDefinitions(supplied).filter(
    (task) => typeof supplied[REQUIRED_WORKER[task.id] as keyof TaskWorkers] === 'function',
  )
}
