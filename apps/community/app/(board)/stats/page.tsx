import type { Metadata } from 'next'

import { PanelPage } from '@/components/shell/panel-page'
import { getActor } from '@/server/context'
import { LEADERBOARD_SIZE, buildStatsView } from '@/server/stats'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Board statistics' }

export default async function StatsPage() {
  const actor = await getActor()
  const now = new Date()
  const preferences = await getViewerPreferences()
  const view = await buildStatsView(actor)

  if (view === null) {
    return (
      <PanelPage title="Board statistics">
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          This board keeps no statistics.
        </p>
      </PanelPage>
    )
  }

  const { totals, topPosters, mostViewed, mostReplied } = view

  return (
    <PanelPage
      gap="loose"
      title="Board statistics"
      lede={
        <>
          {totals.computedAt === null ? (
            'The totals below have not been counted yet — they are rolled up on a schedule.'
          ) : (
            <>
              Totals counted{' '}
              <time dateTime={totals.computedAt.toISOString()}>
                {formatTime(totals.computedAt, now, preferences.timezone).label}
              </time>
              . The tables below are live.
            </>
          )}
        </>
      }
    >

      <section aria-labelledby="totals-heading" className="rounded-lg border border-border bg-card p-4 shadow-elevation">
        <h2 id="totals-heading" className="font-heading text-lg font-semibold">
          Totals
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Figure label="Threads" value={totals.threadCount} />
          <Figure label="Posts" value={totals.postCount} />
          <Figure label="Members" value={totals.memberCount} />
          <div>
            <dt className="text-muted-foreground">Newest member</dt>
            <dd className="font-medium">
              {totals.newestUsername === null ? (
                '—'
              ) : totals.newestUserId === null ? (
                totals.newestUsername
              ) : (
                <a
                  href={`/member/${totals.newestUserId}`}
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {totals.newestUsername}
                </a>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="posters-heading" className="rounded-lg border border-border bg-card p-4 shadow-elevation">
        <h2 id="posters-heading" className="font-heading text-lg font-semibold">
          Top {LEADERBOARD_SIZE} posters
        </h2>
        {topPosters.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nobody has posted yet.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-1 text-sm">
            {topPosters.map((poster, index) => (
              <li key={poster.userId} className="flex justify-between gap-4">
                <span>
                  <span className="text-muted-foreground">{index + 1}.</span>{' '}
                  <a href={`/member/${poster.userId}`} className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
                    {poster.username}
                  </a>
                </span>
                <span className="text-muted-foreground">
                  {poster.postCount.toLocaleString()} posts
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ThreadTable
        id="viewed"
        heading={`Most viewed threads`}
        rows={mostViewed}
        figure={(row) => `${row.viewCount.toLocaleString()} views`}
      />

      <ThreadTable
        id="replied"
        heading={`Most replied-to threads`}
        rows={mostReplied}
        figure={(row) => `${row.replyCount.toLocaleString()} replies`}
      />
    </PanelPage>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value.toLocaleString()}</dd>
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
    <section aria-labelledby={`${id}-heading`} className="rounded-lg border border-border bg-card p-4 shadow-elevation">
      <h2 id={`${id}-heading`} className="font-heading text-lg font-semibold">
        {heading}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing to show yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1 text-sm">
          {rows.map((row, index) => (
            <li key={row.threadId} className="flex justify-between gap-4">
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">{index + 1}.</span>{' '}
                <a
                  href={`/thread/${row.threadId}-${row.slug}`}
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {row.title}
                </a>{' '}
                <span className="text-muted-foreground">in {row.forumTitle}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">{figure(row)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
