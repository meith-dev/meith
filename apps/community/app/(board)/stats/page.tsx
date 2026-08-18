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
            <EmptyTitle>{await tr('page.nothing-counted-here')}</EmptyTitle>
            <EmptyDescription>{await tr('page.this-board-keeps-no-statistics')}</EmptyDescription>
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
          translator.t('board.stats.notCounted')
        ) : (
          <>
            {translator.t('board.stats.counted')}{' '}
            <time dateTime={totals.computedAt.toISOString()}>
              {formatTime(totals.computedAt, now, translator).label}
            </time>
            . {translator.t('board.stats.live')}
          </>
        )
      }
    >
      <PanelSection id="totals-heading" title={await tr('page.totals')}>
        <Card>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Figure
                label={translator.t('board.stats.threads')}
                value={translator.number(totals.threadCount)}
              />
              <Figure
                label={translator.t('board.stats.posts')}
                value={translator.number(totals.postCount)}
              />
              <Figure
                label={translator.t('board.stats.members')}
                value={translator.number(totals.memberCount)}
              />
              <div>
                <dt className="text-muted-foreground">{await tr('page.newest-member')}</dt>
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

      <PanelSection
        id="posters-heading"
        title={translator.t('board.stats.topPosters', { count: LEADERBOARD_SIZE })}
      >
        <Card>
          {topPosters.length === 0 ? (
            <Empty>
              <EmptyTitle>{await tr('page.no-posts-yet')}</EmptyTitle>
              <EmptyDescription>{await tr('page.nobody-has-posted-yet')}</EmptyDescription>
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
        heading={translator.t('board.stats.mostViewed')}
        rows={mostViewed}
        figure={(row) => translator.t('stats.views', { count: row.viewCount })}
      />

      <ThreadTable
        id="replied"
        heading={translator.t('board.stats.mostReplied')}
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

async function ThreadTable({
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
  const translator = await getTranslator()
  return (
    <PanelSection id={`${id}-heading`} title={heading}>
      <Card>
        {rows.length === 0 ? (
          <Empty>
            <EmptyTitle>{await tr('page.no-threads-yet')}</EmptyTitle>
            <EmptyDescription>{await tr('page.nothing-show-yet')}</EmptyDescription>
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
                  <span className="text-muted-foreground">
                    {translator.t('board.stats.inForum', { forum: row.forumTitle })}
                  </span>
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
