import 'server-only'

import { logger } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { requireSlot } from '@meith/theme-kit'

import { filterView } from './plugin-view'
import { currentTheme } from './theme'
import { buildErrorNotice, CRASH_NOTICE, type ErrorNoticeCopy } from '@/view/error-notice'

export async function renderErrorNotice(copy: ErrorNoticeCopy): Promise<React.ReactNode> {
  const requestId = currentRequestId() ?? null
  const ErrorNotice = requireSlot(await currentTheme(), 'ErrorNotice')

  const model = await filterView('view.error-notice', buildErrorNotice(copy, requestId), {
    userId: null,
    isGuest: true,
    requestId,
  })

  return <ErrorNotice {...model} />
}

export async function crashNotice(): Promise<React.ReactNode> {
  try {
    return await renderErrorNotice(CRASH_NOTICE)
  } catch (error) {
    logger({ module: 'error-notice' }).warn(
      { err: String(error) },
      'could not resolve the themed crash notice',
    )
    return null
  }
}
