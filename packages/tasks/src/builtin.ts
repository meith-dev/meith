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
  /** Promotes users who now meet a promotion rule. Returns users moved. */
  applyPromotions(batchSize: number): Promise<number>
  /** Lifts bans whose expiry has passed, restoring each user's prior group. */
  expireBans(batchSize: number): Promise<number>
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
  'promotions.apply': 'applyPromotions',
  'bans.expire': 'expireBans',
}

/**
 * The built-in tasks whose workers actually exist.
 *
 * Takes a *partial* worker set and registers only what can run. Some workers
 * depend on features that are not built yet — `reconcileCounters` needs F38's
 * counter maintenance to have something to reconcile — and the alternatives are
 * both worse than filtering:
 *
 *  - a stub returning 0 pretends work happened, and the tick would report a
 *    healthy run of a task that does nothing;
 *  - a stub that throws makes every tick log a failure and eventually raises an
 *    admin notification for a task nobody asked for.
 *
 * Not registering it means `tasks` holds no row for it, System Health does not
 * list it, and the day F38 supplies the worker it appears on its own. This is
 * the same rule the operator CLI follows by omitting commands it cannot honour:
 * never advertise a capability that is not there.
 */
export function builtinTasks(workers: Partial<TaskWorkers>): TaskDefinition[] {
  const supplied = workers as TaskWorkers
  return allDefinitions(supplied).filter(
    (task) => typeof supplied[REQUIRED_WORKER[task.id] as keyof TaskWorkers] === 'function',
  )
}
