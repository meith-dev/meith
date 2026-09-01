import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { PANEL_CARD, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { ViewTabs } from '@/components/shell/view-tabs'
import { boardUrl } from '@/server/board-url'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { resolveModCpAccess } from '@/server/modcp'
import { pluginBoardPageTitle, renderPluginStaffPage } from '@/server/plugin-pages'
import { pluginStaffPanelSection } from '@/server/plugin-panel'
import { viewerRef } from '@/server/plugin-view'
import { pluginStaffPanelTabs } from '@/view/plugin-panel'

interface RouteParams {
  readonly key: string
  readonly path?: string[]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>
}): Promise<Metadata> {
  const { key, path } = await params
  const title = pluginBoardPageTitle(key, (path ?? []).join('/'))
  return title === null ? {} : { title }
}

export default async function PluginStaffPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { key, path } = await params
  const segments = path ?? []
  if (segments.length > 1) notFound()
  const pagePath = segments.join('/')

  const query: Record<string, string> = {}
  for (const [name, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query[name] = value
  }

  const actor = await getActor()
  const result = await renderPluginStaffPage(key, pagePath, {
    viewer: viewerRef(actor),
    query,
    boardUrl: await boardUrl(),
  })

  if (result.outcome === 'forbidden') notFound()

  const t = await getTranslator()
  const section = await pluginStaffPanelSection(key, t)

  if (result.outcome === 'missing') {
    if (pagePath === '' && section !== null) {
      const access = await resolveModCpAccess()
      if (access?.hasGroupAccess === true) redirect(section.pages[0]!.href)
    }
    notFound()
  }
  const tabs =
    section === null ? [] : pluginStaffPanelTabs({ pages: section.pages, current: pagePath })

  return (
    <PanelPage
      back={{ href: '/modcp', label: await tr('page.moderator-control-panel') }}
      title={result.title}
    >
      {tabs.length > 0 && <ViewTabs label={section?.name ?? result.title} tabs={tabs} />}

      {result.node === null ? (
        <p className={PANEL_NOTE}>{t.t('board.plugin.failed')}</p>
      ) : (
        <section className={PANEL_CARD}>{result.node}</section>
      )}
    </PanelPage>
  )
}
