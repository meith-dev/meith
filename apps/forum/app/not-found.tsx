import { currentRequestId } from '@meith/core/logger'
import { requireSlot } from '@meith/theme-kit'

import { filterView } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'

/**
 * F80 wires `view.error-notice` here, and it is the one filter worth arguing
 * about: this page is what renders when something is broken, so a plugin
 * failing inside it would be a failure on the failure page. It is safe because
 * the host swallows it — the model passes through unchanged and the 404 still
 * renders — which is exactly the property that makes the hook offerable at all.
 *
 * The viewer is reported as a guest rather than resolved. Reaching for the
 * actor here means a database read on a page that may be rendering *because*
 * the database is unavailable (see `ErrorNotice`'s own contract note).
 */
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
