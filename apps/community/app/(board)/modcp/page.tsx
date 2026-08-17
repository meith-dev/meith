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
import { modCpCounts, moderatedForumRights, resolveModCpAccess } from '@/server/modcp'
import { modCpSections } from '@/view/modcp-nav'

export const metadata: Metadata = { title: 'Moderator control panel' }

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

  const waiting: readonly WaitingItem[] = [
    {
      count: counts.pending,
      one: 'post held for approval',
      many: 'posts held for approval',
      href: '/moderation',
      action: 'Review',
    },
    {
      count: counts.openReports,
      one: 'open report',
      many: 'open reports',
      href: '/moderation/reports',
      action: 'Open',
    },
  ]

  return (
    <PanelPage
      title="Moderator control panel"
      lede="The forums you are responsible for, and what they need from you."
      gap="loose"
    >
      <PanelSection id="waiting-heading" title="Waiting for you">
        <PanelWaitingList
          items={waiting}
          emptyTitle="Nothing is waiting"
          emptyDescription="No posts held for approval and no open reports in the forums you moderate."
        />
      </PanelSection>

      <PanelSection
        id="forums-heading"
        title="Your forums"
        description="Busiest first. What you may do in each is on My forums."
      >
        <Card>
          {dashboard.length === 0 ? (
            <Empty className="py-8">
              <EmptyTitle>No forum appointments</EmptyTitle>
              <EmptyDescription>
                You hold moderator permissions but are not assigned to any forum. Your group
                permissions still apply wherever they grant something.
              </EmptyDescription>
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
                      <span className="tabular-nums">{forum.pending}</span> waiting
                    </a>
                    <a href="/moderation/reports" className="hover:text-foreground">
                      <span className="tabular-nums">{forum.openReports}</span> open{' '}
                      {forum.openReports === 1 ? 'report' : 'reports'}
                    </a>
                  </span>
                </li>
              ))}
            </CardRows>
          )}
        </Card>
      </PanelSection>

      <PanelSection id="sections-heading" title="Sections">
        <PanelSectionGrid sections={modCpSections(access)} />
      </PanelSection>
    </PanelPage>
  )
}
