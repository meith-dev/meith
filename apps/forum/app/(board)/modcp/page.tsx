import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModeratorPanel } from '@meith/moderation'
import { Card, CardRows, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import {
  PanelSectionGrid,
  PanelWaitingList,
  type WaitingItem,
} from '@/components/shell/panel-overview'
import { getContainer } from '@/server/container'
import { moderatedForumRights, modCpCounts, resolveModCpAccess } from '@/server/modcp'
import { modCpSections } from '@/view/modcp-nav'

export const metadata: Metadata = { title: 'Moderator control panel' }

/**
 * F54's overview — rebuilt to answer the question the other two panels answer.
 *
 * ## It used to be a report
 *
 * A list of the forums you moderate, busiest first, with two counts tucked into
 * the corner of each row as small grey links. To find out whether anything was
 * waiting you read fourteen rows and added up. Nobody opens a control panel to
 * discover which forums they moderate; they open it because something needs
 * doing, or to check that nothing does — which is the lesson the ACP's index
 * learned first and the member's panel second.
 *
 * So it leads with **what is waiting**: posts held for approval and reports
 * nobody has closed, each a number, a link straight to the queue it belongs to,
 * and nothing else. When both are clear it says so in one line rather than
 * rendering two confident noughts.
 *
 * The forum list is still here, below, because "what am I actually responsible
 * for" is a real question — it is just not the first one. And the sections are
 * listed under that, where each gets the sentence the rail has no room for.
 * Both the rail and this grid read `modCpSections`, so the panel cannot grow a
 * screen that only one of them knows about.
 *
 * ## The counts are the counts the rail shows
 *
 * `modCpCounts` is `React.cache`d and the shell has already called it this
 * request, so the two numbers at the top of this page and the two badges beside
 * the rail's first two rows are the same pair of reads, and cannot disagree.
 *
 * The per-forum figures are one query for every forum rather than two per forum
 * — a dashboard listing fourteen forums must not be twenty-eight statements,
 * which is the N+1 F11's budget helper exists to catch.
 */
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
                {/*
                  A group-level moderator with no forum appointments still
                  reaches the panel — `modcp.access` is a real grant — and
                  telling them the truth is better than an empty table that
                  looks broken.
                */}
                You hold moderator permissions but are not assigned to any forum. Your
                group permissions still apply wherever they grant something.
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
                    href={`/forum/${forum.forumId}-${forum.slug}`}
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
