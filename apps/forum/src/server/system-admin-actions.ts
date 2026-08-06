'use server'

import { CacheTags, ValidationError, isAppError, logger } from '@meith/core'
import { drivers } from '@meith/drivers'

import { recordAdminAction, requireAdmin } from './admin'
import { requireSearch } from './search'
import { requireMaintenance, requireRecount } from './system-admin'
import type { FormState } from './auth-form-state'

const SWEEP_LIMIT = 5_000

const RECOUNT_BATCH = 500

const REINDEX_BATCH = 2_000

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'system-admin' }).error({ err }, 'maintenance action failed')
  return { error: 'Something went wrong. Please try again.' }
}

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

export async function reindexSearchAction(): Promise<FormState> {
  try {
    await requireAdmin()

    const result = await requireSearch().reindexChunk(0, REINDEX_BATCH)
    const progress = await requireSearch().indexProgress()

    await recordAdminAction({
      action: 'system.search_reindexed',
      detail: { indexed: result.indexed, pending: progress.pending },
    })

    return {
      notice: progress.pending > 0 ? 'more' : 'finished',
      values: { indexed: String(result.indexed), pending: String(progress.pending) },
    }
  } catch (err) {
    return toFormState(err)
  }
}

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
