import type { Metadata } from 'next'

import { Card, CardContent, CardRows, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { buildStatsView, LEADERBOARD_SIZE } from '@/server/stats'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.board-statistics') }
}

const LINK =
  'font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground'

const ROW = 'flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm'

export default async function StatsPage() {
  const actor = await getActor()
  const now = new Date()
  const translator = await getTranslator()
  const _preferences = await getViewerPreferences()
  const view = await buildStatsView(actor)

  if (view === null) {
    return (
      <PanelPage frame="standalone" title={await tr('page.board-statistics')}>
        <Card>
          <Empty>
            <EmptyTitle>Nothing is counted here</EmptyTitle>
            <EmptyDescription>This board keeps no statistics.</EmptyDescription>
          </Empty>
        </Card>
      </PanelPage>
    )
  }

  const { totals, topPosters, mostViewed, mostReplied } = view

  return (
    <PanelPage
      frame="standalone"
      gap="loose"
      title={await tr('page.board-statistics')}
      lede={
        totals.computedAt === null ? (
          'The totals below have not been counted yet — they are rolled up on a schedule.'
        ) : (
          <>
            Totals counted{' '}
            <time dateTime={totals.computedAt.toISOString()}>
              {formatTime(totals.computedAt, now, translator).label}
            </time>
            . The tables below are live.
          </>
        )
      }
    >
      <PanelSection id="totals-heading" title={await tr('page.totals')}>
        <Card>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Figure label="Threads" value={translator.number(totals.threadCount)} />
              <Figure label="Posts" value={translator.number(totals.postCount)} />
              <Figure label="Members" value={translator.number(totals.memberCount)} />
              <div>
                <dt className="text-muted-foreground">Newest member</dt>
                <dd className="font-medium">
                  {totals.newestUsername === null ? (
                    '—'
                  ) : totals.newestUserId === null ? (
                    totals.newestUsername
                  ) : (
                    <a href={`/member/${totals.newestUserId}`} className={LINK}>
                      {totals.newestUsername}
                    </a>
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </PanelSection>

      <PanelSection id="posters-heading" title={`Top ${LEADERBOARD_SIZE} posters`}>
        <Card>
          {topPosters.length === 0 ? (
            <Empty>
              <EmptyTitle>No posts yet</EmptyTitle>
              <EmptyDescription>Nobody has posted yet.</EmptyDescription>
            </Empty>
          ) : (
            <CardRows>
              {topPosters.map((poster, index) => (
                <li key={poster.userId} className={ROW}>
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground tabular-nums">{index + 1}.</span>{' '}
                    <a href={`/member/${poster.userId}`} className={LINK}>
                      {poster.username}
                    </a>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {translator.t('stats.posts', { count: poster.postCount })}
                  </span>
                </li>
              ))}
            </CardRows>
          )}
        </Card>
      </PanelSection>

      <ThreadTable
        id="viewed"
        heading="Most viewed threads"
        rows={mostViewed}
        figure={(row) => translator.t('stats.views', { count: row.viewCount })}
      />

      <ThreadTable
        id="replied"
        heading="Most replied-to threads"
        rows={mostReplied}
        figure={(row) => translator.t('stats.replies', { count: row.replyCount })}
      />
    </PanelPage>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function ThreadTable({
  id,
  heading,
  rows,
  figure,
}: {
  id: string
  heading: string
  rows: readonly {
    threadId: number
    title: string
    slug: string
    forumId: number
    forumTitle: string
    viewCount: number
    replyCount: number
  }[]
  figure: (row: { viewCount: number; replyCount: number }) => string
}) {
  return (
    <PanelSection id={`${id}-heading`} title={heading}>
      <Card>
        {rows.length === 0 ? (
          <Empty>
            <EmptyTitle>No threads yet</EmptyTitle>
            <EmptyDescription>Nothing to show yet.</EmptyDescription>
          </Empty>
        ) : (
          <CardRows>
            {rows.map((row, index) => (
              <li key={row.threadId} className={ROW}>
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground tabular-nums">{index + 1}.</span>{' '}
                  <a href={`/thread/${row.threadId}-${row.slug}`} className={LINK}>
                    {row.title}
                  </a>{' '}
                  <span className="text-muted-foreground">in {row.forumTitle}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{figure(row)}</span>
              </li>
            ))}
          </CardRows>
        )}
      </Card>
    </PanelSection>
  )
}
