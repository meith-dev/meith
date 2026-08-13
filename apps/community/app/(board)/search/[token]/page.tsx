import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isAppError } from '@meith/core'
import {
  Card,
  CardContent,
  CardFooter,
  CardRows,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Field,
  Input,
  buttonVariants,
} from '@meith/ui'

import { getActor } from '@/server/context'
import { openSearch, SEARCH_PAGE } from '@/server/search-page'
import { currentSessionKey } from '@/server/session-key'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { postLink } from '@/view/post-link'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Search results' }

const QUIET_LINK =
  'text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground'

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
    if (isAppError(err)) notFound()
    throw err
  }

  const { search, results } = view
  const { timezone } = await getViewerPreferences()

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
            {formatTime(search.createdAt, now, timezone).label}
          </time>
          . Results are checked against your access every time this page is
          opened, so they can change.
        </p>
      </div>

      <Card>
        {results.hits.length === 0 ? (
          <Empty>
            <EmptyTitle>Nothing matched.</EmptyTitle>
            <EmptyDescription>
              Or nothing you can see does. Try fewer words, or a different
              spelling.
            </EmptyDescription>
          </Empty>
        ) : (
          <CardRows>
            {results.hits.map((hit) => (
              <li key={hit.postId} className="flex flex-col gap-1 px-4 py-3">
                <a
                  href={postLink(`/thread/${hit.threadId}-${hit.threadSlug}`, hit.postId)}
                  className={QUIET_LINK}
                >
                  {hit.threadTitle}
                </a>
                <p
                  className="text-sm text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground"
                  dangerouslySetInnerHTML={{ __html: hit.excerpt }}
                />
                <p className="text-xs text-muted-foreground">
                  {hit.authorUsername} ·{' '}
                  <time dateTime={hit.postedAt.toISOString()}>
                    {formatTime(hit.postedAt, now, timezone).label}
                  </time>
                </p>
              </li>
            ))}
          </CardRows>
        )}

        {nextHref !== null && (
          <CardFooter>
            <a href={nextHref} className={QUIET_LINK}>
              Next {SEARCH_PAGE} results →
            </a>
          </CardFooter>
        )}
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form method="get" action="/search" className="flex flex-col gap-4">
            <Field
              name="q"
              label="Search within these results"
              description="Adds your words to the ones above. Everything already typed stays."
            >
              {(control) => (
                <Input
                  {...control}
                  defaultValue={`${search.terms} `}
                  type="search"
                  autoComplete="off"
                />
              )}
            </Field>

            <div>
              <button type="submit" className={buttonVariants({ variant: 'primary' })}>
                Search within
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <a href="/search" className={QUIET_LINK}>
        Start a new search
      </a>
    </main>
  )
}
