'use server'

import { revalidatePath } from 'next/cache'

import { NotFoundError, ValidationError } from '@meith/core'
import { drivers } from '@meith/drivers'
import { msg } from '@meith/i18n'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { clearableTag } from './cache-targets'
import { formStateReporter } from './form-state-reporter'
import { requireSearch } from './search'
import { requireMaintenance, requireRecount } from './system-admin'
import { applyPendingUpgrade } from './upgrade-notice'

const SWEEP_LIMIT = 5_000

const RECOUNT_BATCH = 500

const REINDEX_BATCH = 2_000

const toFormState = formStateReporter('system-admin', 'maintenance action failed')

function refreshSystemScreen(): void {
  revalidatePath('/admin/system')
}

export async function pruneSessionsAction(): Promise<FormState> {
  try {
    await requireAdmin()

    const removed = await requireMaintenance().pruneSessions(new Date(), SWEEP_LIMIT)

    refreshSystemScreen()
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

    refreshSystemScreen()
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

    refreshSystemScreen()
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

    refreshSystemScreen()
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

export async function applyUpgradeAction(): Promise<FormState> {
  try {
    await requireFreshAdmin()

    const result = await applyPendingUpgrade()

    refreshSystemScreen()
    revalidatePath('/admin')
    await recordAdminAction({
      action: 'system.upgrade_applied',
      detail: { plugins: result.plugins },
    })

    return { notice: 'upgraded' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function clearCacheAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const tag = clearableTag(form.get('what'))

    if (tag === null) throw new ValidationError(msg('error.app.choose-what-clear'))

    await drivers().cache.invalidateTags([tag])

    refreshSystemScreen()
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
      throw new ValidationError(msg('error.app.such-job'))
    }

    const id = jobId.trim()
    const requeued = await drivers().queue.retry(id)

    if (!requeued) {
      throw new NotFoundError(
        `No dead-lettered job ${id}. Only a job that has exhausted its attempts can be retried.`,
      )
    }

    refreshSystemScreen()
    await recordAdminAction({ action: 'system.job_retried', detail: { jobId: id } })
    return { notice: 'retried' }
  } catch (err) {
    return toFormState(err)
  }
}
