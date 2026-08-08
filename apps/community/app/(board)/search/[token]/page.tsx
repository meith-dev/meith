import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isAppError } from '@meith/core'

import { getActor } from '@/server/context'
import { openSearch, SEARCH_PAGE } from '@/server/search-page'
import { currentSessionKey } from '@/server/session-key'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Search results' }

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * F73 — a stored search's results.
 *
 * The page **re-runs** the stored query rather than reading a frozen list of
 * hits, so every visit applies the current viewer's scope: a post deleted since
 * the search was run is gone, and a member who has lost access to a forum stops
 * seeing its hits at once. A frozen list would be faster here and wrong in both
 * of those ways.
 *
 * Paging is a link carrying the keyset cursor — no JavaScript, and the address
 * stays short because the *query* lives in the stored row rather than in the
 * URL.
 */
export default async function SearchResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const query = await searchParams

  const one = (key: string): string | undefined => {
    const raw = query[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text === undefined || text === '' ? undefined : text
  }

  const rank = Number(one('rank'))
  const postId = Number(one('after'))
  const after =
    Number.isFinite(rank) && Number.isSafeInteger(postId) && postId > 0
      ? { rank, postId }
      : null

  const actor = await getActor()
  const now = new Date()

  let view
  try {
    view = await openSearch({
      actor,
      sessionKey: await currentSessionKey(),
      token,
      after,
    })
  } catch (err) {
    /*
     * A search that is not this viewer's is a 404, not a 403: "this exists but
     * is not yours" confirms that somebody ran it, which is the fact being
     * protected.
     */
    if (isAppError(err)) notFound()
    throw err
  }

  const { search, results } = view

  const nextHref =
    results.nextCursor === null
      ? null
      : `/search/${token}?rank=${results.nextCursor.rank}&after=${results.nextCursor.postId}`

  return (
    <main id="board-content" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 flex-1">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">
          Results for &ldquo;{search.terms}&rdquo;
        </h1>
        <p className="text-sm text-muted-foreground">
          Searched{' '}
          <time dateTime={search.createdAt.toISOString()}>
            {formatTime(search.createdAt, now).label}
          </time>
          . Results are checked against your access every time this page is
          opened, so they can change.
        </p>
      </div>

      {results.hits.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Nothing matched — or nothing you can see does. Try fewer words, or a
          different spelling.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {results.hits.map((hit) => (
            <li key={hit.postId} className="flex flex-col gap-1 px-4 py-3">
              <a
                href={`/thread/${hit.threadId}-${hit.threadSlug}?post=${hit.postId}#post-${hit.postId}`}
                className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                {hit.threadTitle}
              </a>
              {/*
                The excerpt is `ts_headline`'s output: the same engine that
                matched the terms marks them, so a stemmed match ("running"
                found by "run") is highlighted correctly. It is the renderer's
                own markup, not a member's.
              */}
              <p
                className="text-sm text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground"
                dangerouslySetInnerHTML={{ __html: hit.excerpt }}
              />
              <p className="text-xs text-muted-foreground">
                {hit.authorUsername} ·{' '}
                <time dateTime={hit.postedAt.toISOString()}>
                  {formatTime(hit.postedAt, now).label}
                </time>
              </p>
            </li>
          ))}
        </ul>
      )}

      {nextHref !== null && (
        <a href={nextHref} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          Next {SEARCH_PAGE} results →
        </a>
      )}

      {/*
        Search within results. A new search rather than an intersection — with
        the query stored rather than a list of ids, "within" is simply "and",
        which is what full-text search does natively and what a member means.
      */}
      <form method="get" action="/search" className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Search within these results</span>
          <input name="q" defaultValue={`${search.terms} `} className={INPUT} />
          <span className="text-xs text-muted-foreground">
            Adds your words to the ones above. Everything already typed stays.
          </span>
        </label>
        <div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Search within
          </button>
        </div>
      </form>

      <a href="/search" className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
        Start a new search
      </a>
    </main>
  )
}
