'use server'

import { revalidatePath } from 'next/cache'

import { isAppError, logger } from '@meith/core'

import { recordAdminAction, requireAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { tr } from './i18n'
import { refreshMarketplaceNow } from './marketplace-admin'

export async function refreshMarketplaceAction(
  _prev: FormState,
  _form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const result = await refreshMarketplaceNow()

    revalidatePath('/admin/plugins')
    revalidatePath('/admin/themes')

    await recordAdminAction({
      action: 'marketplace.refresh',
      detail: { ok: result.ok, listingCount: result.listingCount },
    })

    if (result.ok) return { notice: 'refreshed' }
    return {
      error: result.errorMessage ?? (await tr('notice.app.something-went-wrong-please-try')),
    }
  } catch (err) {
    if (isAppError(err)) return { error: err.message }
    logger({ module: 'marketplace-admin' }).error(
      { err },
      'failed to refresh the marketplace catalog',
    )
    return { error: await tr('notice.app.something-went-wrong-please-try') }
  }
}
