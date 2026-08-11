import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isAppError } from '@meith/core'

import { getActor } from '@/server/context'
import {
  DISCOVER_PAGE,
  DISCOVERY_VIEWS,
  isDiscoveryView,
  runDiscovery,
  type DiscoveryView,
} from '@/server/discovery'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { ViewTabs } from '@/components/shell/view-tabs'
import { formatTime } from '@/view/time'

const TABS: Record<DiscoveryView, { readonly label: string; readonly blurb: string }> = {
  new: {
    label: 'New posts',
    blurb: 'Threads with a reply in the last day.',
  },
  today: {
    label: "Today's posts",
    blurb: 'Threads with a reply since midnight, in your timezone.',
  },
  mine: {
    label: 'My threads',
    blurb: 'Threads you started.',
  },
  participated: {
    label: 'My posts',
    blurb: 'Threads you have posted in.',
  },
  unanswered: {
    label: 'Unanswered',
    blurb: 'Threads nobody has replied to yet — a good place to help.',
  },
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ view: string }>
}): Promise<Metadata> {
  const { view } = await params
  return { title: isDiscoveryView(view) ? TABS[view].label : 'Discover' }
}

export default async function DiscoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { view } = await params
  if (!isDiscoveryView(view)) notFound()

  const query = await searchParams
  const one = (key: string): string | undefined => {
    const raw = query[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text === undefined || text === '' ? undefined : text
  }

  const at = new Date(one('at') ?? '')
  const threadId = Number(one('after'))
  const after =
    !Number.isNaN(at.getTime()) && Number.isSafeInteger(threadId) && threadId > 0
      ? { at, threadId }
      : null

  const actor = await getActor()
  const preferences = await getViewerPreferences()
  const now = new Date()

  let page
  try {
    page = await runDiscovery({
      actor,
      view,
      now,
      timeZone: preferences.timezone,
      after,
    })
  } catch (err) {
    if (isAppError(err)) {
      return (
        <main id="board-content" tabIndex={-1} className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 flex-1">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold">{TABS[view].label}</h1>
            <p className="text-sm text-muted-foreground">{TABS[view].blurb}</p>
          </div>

          <Tabs current={view} />
          <p role="alert" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            {err.message}{' '}
            <a href="/login" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Sign in
            </a>
          </p>
        </main>
      )
    }
    throw err
  }

  const nextHref =
    page.nextCursor === null
      ? null
      : `/discover/${view}?at=${encodeURIComponent(page.nextCursor.at.toISOString())}&after=${page.nextCursor.threadId}`

  return (
    <main id="board-content" tabIndex={-1} className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 flex-1">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">{TABS[view].label}</h1>
        <p className="text-sm text-muted-foreground">{TABS[view].blurb}</p>
      </div>

      <Tabs current={view} />

      {page.rows.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Nothing here right now.{' '}
          {after === null
            ? 'Check back later, or start a conversation of your own.'
            : 'You have reached the end of this list.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-elevation">
          {page.rows.map((row) => (
            <li
              key={row.threadId}
              className="flex flex-col gap-1.5 px-4 py-3.5 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <a
                  href={`/thread/${row.threadId}-${row.slug}`}
                  className="truncate text-[0.9375rem] font-semibold text-foreground hover:underline"
                >
                  {row.title}
                </a>
                <p className="truncate text-xs text-muted-foreground">
                  in{' '}
                  <a href={`/${row.forumId}-${row.forumSlug}`} className="font-medium hover:underline">
                    {row.forumTitle}
                  </a>{' '}
                  · started by {row.authorUsername}
                </p>
              </div>

              <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
                <span className="font-semibold text-foreground tabular-nums">{row.replyCount}</span>{' '}
                {row.replyCount === 1 ? 'reply' : 'replies'}
                <span className="block">
                  last post{' '}
                  <time dateTime={row.lastPostAt.toISOString()}>
                    {formatTime(row.lastPostAt, now, preferences.timezone).label}
                  </time>
                  {row.lastPostUsername === null ? null : ` by ${row.lastPostUsername}`}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}

      {nextHref !== null && (
        <a
          href={nextHref}
          className="inline-flex h-9 w-fit items-center rounded-full bg-secondary px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-accent"
        >
          Next {DISCOVER_PAGE} threads →
        </a>
      )}
    </main>
  )
}

function Tabs({ current }: { current: DiscoveryView }) {
  return (
    <ViewTabs
      label="Discovery views"
      tabs={DISCOVERY_VIEWS.map((view) => ({
        href: `/discover/${view}`,
        label: TABS[view].label,
        isCurrent: view === current,
      }))}
    />
  )
}
