import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModeratorPanel } from '@meith/moderation'
import { Card, CardRows, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import {
  PanelSectionGrid,
  PanelWaitingList,
  type WaitingItem,
} from '@/components/shell/panel-overview'
import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getTranslator, tr } from '@/server/i18n'
import { modCpCounts, moderatedForumRights, resolveModCpAccess } from '@/server/modcp'
import { modCpSections } from '@/view/modcp-nav'
import { panelSectionCopy } from '@/view/panel-nav'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.moderator-control-panel') }
}

export default async function ModCpPage() {
  const access = await resolveModCpAccess()
  if (access === null) notFound()

  const { modcp } = getContainer()
  if (modcp === null) notFound()

  const forums = await moderatedForumRights(access)
  const [dashboard, counts] = await Promise.all([
    new ModeratorPanel({ modcp }).dashboard({ forums }),
    modCpCounts(),
  ])
  const translator = await getTranslator()

  const waiting: readonly WaitingItem[] = [
    {
      count: counts.pending,
      one: translator.t('board.modcp.pending', { count: 1 }),
      many: translator.t('board.modcp.pending', { count: 2 }),
      href: '/moderation',
      action: translator.t('board.modcp.review'),
    },
    {
      count: counts.openReports,
      one: translator.t('board.modcp.report', { count: 1 }),
      many: translator.t('board.modcp.report', { count: 2 }),
      href: '/moderation/reports',
      action: translator.t('board.modcp.open'),
    },
  ]

  return (
    <PanelPage
      title={await tr('page.moderator-control-panel')}
      lede={await tr('page.forums-responsible-for-what-they')}
      gap="loose"
    >
      <PanelSection id="waiting-heading" title={await tr('page.waiting-for')}>
        <PanelWaitingList
          items={waiting}
          emptyTitle={translator.t('board.modcp.nothingWaiting')}
          emptyDescription={translator.t('board.modcp.nothingWaitingHint')}
        />
      </PanelSection>

      <PanelSection
        id="forums-heading"
        title={await tr('page.forums-2')}
        description={translator.t('board.modcp.forumsHint')}
      >
        <Card>
          {dashboard.length === 0 ? (
            <Empty className="py-8">
              <EmptyTitle>{await tr('page.no-forum-appointments')}</EmptyTitle>
              <EmptyDescription>{translator.t('board.modcp.noAppointmentsHint')}</EmptyDescription>
            </Empty>
          ) : (
            <CardRows>
              {dashboard.map((forum) => (
                <li
                  key={forum.forumId}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
                >
                  <a
                    href={`/${forum.forumId}-${forum.slug}`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {forum.title}
                  </a>
                  <span className="flex gap-3 text-xs text-muted-foreground">
                    <a href="/moderation" className="hover:text-foreground">
                      {translator.t('board.modcp.waiting', { count: forum.pending })}
                    </a>
                    <a href="/moderation/reports" className="hover:text-foreground">
                      {translator.t('board.modcp.openReports', { count: forum.openReports })}
                    </a>
                  </span>
                </li>
              ))}
            </CardRows>
          )}
        </Card>
      </PanelSection>

      <PanelSection id="sections-heading" title={await tr('page.sections')}>
        <PanelSectionGrid sections={panelSectionCopy(modCpSections(access), translator)} />
      </PanelSection>
    </PanelPage>
  )
}
