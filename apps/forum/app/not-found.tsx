import { requireSlot } from '@forum/theme-kit'

import { activeTheme } from '@/server/theme'

export default function NotFound() {
  const ErrorNotice = requireSlot(activeTheme, 'ErrorNotice')

  return (
    <main id="board-content" className="flex flex-1 items-center justify-center px-6 py-12">
      <ErrorNotice
        status={404}
        title="Page not found"
        message="The page you requested does not exist or is no longer available."
        homeHref="/"
        requestId={null}
      />
    </main>
  )
}
