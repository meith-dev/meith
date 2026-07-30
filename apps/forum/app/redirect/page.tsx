import type { Metadata } from 'next'

import { requireSlot } from '@forum/theme-kit'

import { activeTheme } from '@/server/theme'
import { buildRedirectNotice } from '@/view/redirect-notice'

export const metadata: Metadata = { title: 'Redirecting' }

export default async function RedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; message?: string }>
}) {
  const { to, message } = await searchParams
  const notice = buildRedirectNotice(to, message)
  const RedirectNotice = requireSlot(activeTheme, 'RedirectNotice')

  return (
    <>
      <meta httpEquiv="refresh" content={`${notice.delaySeconds};url=${notice.targetHref}`} />
      <main id="board-content" tabIndex={-1} className="flex flex-1 items-center justify-center px-6 py-12">
        <RedirectNotice {...notice} />
      </main>
    </>
  )
}
