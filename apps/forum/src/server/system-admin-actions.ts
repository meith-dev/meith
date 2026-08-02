'use server'

/**
 * F70 — the maintenance writes.
 *
 * Every one of these is bounded. That is not a performance choice: this panel
 * runs inside a request, and a sweep that ran to completion over a large table
 * would be killed by the platform's execution limit somewhere in the middle,
 * leaving an operator with no idea how far it got. Bounded batches with a count
 * back are the only shape that reports the truth.
 *
 * None of them is re-authenticated, and that is deliberate. Pruning expired
 * sessions removes rows that no longer authenticate anybody; rebuilding counters
 * recomputes derived numbers from the content that is already there; clearing a
 * cache throws away copies of data that still exists. There is nothing here an
 * operator can destroy, so a password prompt would train them to type it for
 * operations that do not need it — which is exactly what makes the prompt
 * meaningless on the operations that do.
 */
import { CacheTags, ValidationError, isAppError, logger } from '@forum/core'
import { drivers } from '@forum/drivers'

import { recordAdminAction, requireAdmin } from './admin'
import { requireMaintenance, requireRecount } from './system-admin'
import type { FormState } from './auth-form-state'

/** One press of a maintenance button. */
const SWEEP_LIMIT = 5_000

/** Rows the recount reconciles per press. */
const RECOUNT_BATCH = 500

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'system-admin' }).error({ err }, 'maintenance action failed')
  return { error: 'Something went wrong. Please try again.' }
}

/**
 * Delete expired sessions and revoked ones past their grace period.
 *
 * The grace exists so that "you were signed out" can still be explained: a
 * revoked session kept for a day is the difference between an answer and a
 * shrug when somebody asks why they were logged out.
 */
export async function pruneSessionsAction(): Promise<FormState> {
  try {
    await requireAdmin()

    const removed = await requireMaintenance().pruneSessions(new Date(), SWEEP_LIMIT)

    await recordAdminAction({ action: 'system.sessions_pruned', detail: { removed } })
    return { notice: 'pruned', values: { removed: String(removed) } }
  } catch (err) {
    return toFormState(err)
  }
}

/** Delete password-reset and activation tokens that can no longer be used. */
export async function pruneTokensAction(): Promise<FormState> {
  try {
    await requireAdmin()

    const removed = await requireMaintenance().pruneExpiredTokens(new Date(), SWEEP_LIMIT)

    await recordAdminAction({ action: 'system.tokens_pruned', detail: { removed } })
    return { notice: 'pruned', values: { removed: String(removed) } }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Run one batch of F38's recount.
 *
 * Resumable by construction: the phase and cursor live in
 * `counter_recount_state`, so this picks up where the scheduled run — or the
 * last press — left off rather than starting over. Starting over is what makes
 * a recount on a large board never finish.
 */
export async function recountAction(): Promise<FormState> {
  try {
    await requireAdmin()

    const { corrected } = await requireRecount().run(RECOUNT_BATCH)

    await recordAdminAction({ action: 'system.recount_ran', detail: { corrected } })
    return { notice: 'ran', values: { corrected: String(corrected) } }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Throw away a cached view of something.
 *
 * Tag-scoped rather than a "clear everything" button. A blanket flush on a busy
 * board is a stampede — every request that was being served from cache goes to
 * the database at once — and the reason somebody reaches for it is almost
 * always one stale thing they can name.
 */
export async function clearCacheAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const what = form.get('what')
    const tag =
      what === 'forums'
        ? CacheTags.forumTree()
        : what === 'permissions'
          ? CacheTags.permissions()
          : null

    if (tag === null) throw new ValidationError('Choose what to clear.')

    await drivers().cache.invalidateTags([tag])

    await recordAdminAction({ action: 'system.cache_cleared', detail: { tag } })
    return { notice: 'cleared', values: { tag } }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Put a dead-lettered job back on the queue.
 *
 * One at a time and by id, rather than "retry everything". A job dead-letters
 * after exhausting its attempts, so the reason is usually still true — retrying
 * the lot puts the same failures straight back, and buries the one an operator
 * had actually fixed.
 */
export async function retryJobAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const jobId = form.get('jobId')
    if (typeof jobId !== 'string' || jobId.trim() === '') {
      throw new ValidationError('No such job.')
    }

    await drivers().queue.retry(jobId.trim())

    await recordAdminAction({ action: 'system.job_retried', detail: { jobId } })
    return { notice: 'retried' }
  } catch (err) {
    return toFormState(err)
  }
}
