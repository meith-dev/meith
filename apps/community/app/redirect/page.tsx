import type { Metadata } from 'next'

import { requireSlot, slotCopy } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'
import { buildRedirectNotice, localHref } from '@/view/redirect-notice'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.redirecting') }
}

export default async function RedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; m?: string }>
}) {
  const { to, m } = await searchParams
  const translator = await getTranslator()
  const filtered = await filterView(
    'view.redirect-notice',
    buildRedirectNotice(to, m, translator),
    viewerRef(await getActor()),
  )
  const notice = { ...filtered, targetHref: localHref(filtered.targetHref) }
  const RedirectNotice = requireSlot(await currentTheme(), 'RedirectNotice')

  return (
    <>
      <meta httpEquiv="refresh" content={`${notice.delaySeconds};url=${notice.targetHref}`} />
      <main
        id="board-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-6 py-12"
      >
        <RedirectNotice
          {...notice}
          copy={slotCopy(await currentTheme(), 'RedirectNotice', translator)}
        />
      </main>
    </>
  )
}
