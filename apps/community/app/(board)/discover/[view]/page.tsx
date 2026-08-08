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

/**
 * F74 — the discovery screens.
 *
 * One route for five views, because they differ only in the question asked:
 * the listing, the paging and the permission scope are identical, and five
 * pages would be five places for those to drift. The view is a path segment
 * rather than a query parameter so each is a real, linkable, bookmarkable
 * address — a member sends somebody `/discover/unanswered`, not a form.
 *
 * **No JavaScript.** Paging is a link carrying the keyset cursor (D06), which
 * is why the cursor is two values in the query string rather than an opaque
 * blob: an address a member can read is one they can trust, and there is
 * nothing in it worth hiding.
 */

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
  /*
   * An unknown view is a 404 rather than a redirect to the default. A member
   * following a stale link should be told the page is gone, not shown a
   * different list and left believing it is the one they asked for.
   */
  if (!isDiscoveryView(view)) notFound()

  const query = await searchParams
  const one = (key: string): string | undefined => {
    const raw = query[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text === undefined || text === '' ? undefined : text
  }

  /*
   * Both halves of the cursor or neither. A half-read cursor would silently
   * become "start from the beginning", so a mangled link would loop the first
   * page forever rather than saying anything.
   */
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
    /*
     * The two personal views need a signed-in member. That is a refusal with a
     * reason rather than an empty list, because "no threads" and "you are not
     * signed in" look identical on screen and lead to opposite next actions.
     */
    if (isAppError(err)) {
      return (
        /*
         * The heading, the blurb and the tabs, exactly as the success branch
         * renders them. This branch used to open with the tab row and no
         * `<h1>` at all — a page with no heading has no outline for a screen
         * reader to navigate, and it is the branch a signed-out visitor is
         * most likely to land on, because the two personal views are the ones
         * that refuse.
         */
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
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {page.rows.map((row) => (
            <li
              key={row.threadId}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <a
                  href={`/thread/${row.threadId}-${row.slug}`}
                  className="truncate text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {row.title}
                </a>
                <p className="text-xs text-muted-foreground">
                  {/*
                    The forum is on every row because these lists cross the whole
                    board: without it, two identically named threads in two
                    forums are indistinguishable. It comes from the same query as
                    the row (F74's budget), not a lookup per line.
                  */}
                  in{' '}
                  <a href={`/${row.forumId}-${row.forumSlug}`} className="hover:underline">
                    {row.forumTitle}
                  </a>{' '}
                  · started by {row.authorUsername}
                </p>
              </div>

              <p className="shrink-0 text-xs text-muted-foreground">
                {row.replyCount} {row.replyCount === 1 ? 'reply' : 'replies'} · last post{' '}
                <time dateTime={row.lastPostAt.toISOString()}>
                  {formatTime(row.lastPostAt, now, preferences.timezone).label}
                </time>
                {row.lastPostUsername === null ? null : ` by ${row.lastPostUsername}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {nextHref !== null && (
        <a href={nextHref} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          Next {DISCOVER_PAGE} threads →
        </a>
      )}
    </main>
  )
}

/**
 * The five views, always all of them.
 *
 * Rendered for a guest too, including the two that will refuse: a member who
 * cannot see a tab does not learn it exists, and the refusal names the reason
 * and offers the sign-in link, which is more useful than the tab disappearing.
 *
 * The row itself is `ViewTabs`, shared with the inbox's folders and a forum's
 * ordering — see that file for why the board had three of these and now has
 * one.
 */
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
