import { currentRequestId } from '@meith/core/logger'
import { requireSlot } from '@meith/theme-kit'

import { filterView } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'

export default async function NotFound() {
  const ErrorNotice = requireSlot(await currentTheme(), 'ErrorNotice')

  const model = await filterView(
    'view.error-notice',
    {
      status: 404,
      title: 'Page not found',
      message: 'The page you requested does not exist or is no longer available.',
      homeHref: '/',
      requestId: currentRequestId() ?? null,
    },
    { userId: null, isGuest: true, requestId: currentRequestId() ?? null },
  )

  return (
    <main id="board-content" tabIndex={-1} className="flex flex-1 items-center justify-center px-6 py-12">
      <ErrorNotice {...model} />
    </main>
  )
}
