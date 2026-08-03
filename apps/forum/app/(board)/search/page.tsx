import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { MAX_QUERY_LENGTH } from '@forum/search'

import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { runSearch, type SearchFilters } from '@/server/search-page'
import { currentSessionKey } from '@/server/session-key'

export const metadata: Metadata = { title: 'Search' }

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * F73 — the search form, and the one place a search is started.
 *
 * **A GET form that redirects to a stored search.** The form submits to this
 * page; this page stores the query, and sends the member to
 * `/search/<token>` — so the results page has a short, bookmarkable address
 * that carries no filters, paging works without re-submitting anything, and the
 * whole thing needs no JavaScript at all.
 *
 * Doing it the other way round — results rendered straight from the query
 * string — is what makes a "next page" link a wall of parameters and a
 * "search within results" link impossible to build.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const value = (key: string): string => {
    const raw = params[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text ?? ''
  }

  const actor = await getActor()
  const terms = value('q')

  /* Only run when something was actually submitted. */
  if (terms !== '') {
    const sort = value('sort')
    const filters: SearchFilters = {
      sort: sort === 'newest' || sort === 'oldest' ? sort : 'relevance',
      ...(value('forum') === '' ? {} : { forumIds: [Number(value('forum'))] }),
    }

    const outcome = await runSearch({
      actor,
      sessionKey: await currentSessionKey(),
      terms,
      filters,
    })

    if (outcome.kind === 'ok') redirect(`/search/${outcome.token}`)

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">Search</h1>
        <p role="alert" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {outcome.kind === 'flooded'
            ? `You are searching very quickly. Try again in ${outcome.seconds} seconds.`
            : outcome.reason === 'too-short'
              ? 'That search is too short — try a whole word.'
              : outcome.reason === 'too-long'
                ? 'That search is too long to run.'
                : 'Type something to search for.'}
        </p>
        <SearchForm defaultTerms={terms} forums={await visibleForums()} />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <h1 className="font-serif text-2xl font-semibold">Search</h1>
      <p className="text-sm text-muted-foreground">
        Searches every forum you can see. Put a phrase in quotes to match it
        exactly, and put a minus in front of a word to exclude it.
      </p>
      <SearchForm defaultTerms="" forums={await visibleForums()} />
    </div>
  )
}

/** The forums this viewer may search, for the filter. */
async function visibleForums(): Promise<readonly { id: number; title: string }[]> {
  const actor = await getActor()
  const { authorizer, forums } = getContainer()

  const allowed = new Set(await authorizer.forumIdsWhere(actor, 'thread.view'))
  return (await forums.listAll())
    .filter((forum) => allowed.has(forum.id) && forum.type === 'forum')
    .map((forum) => ({ id: forum.id, title: forum.title }))
}

function SearchForm({
  defaultTerms,
  forums,
}: {
  defaultTerms: string
  forums: readonly { id: number; title: string }[]
}) {
  return (
    <form method="get" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Search for</span>
        <input
          name="q"
          defaultValue={defaultTerms}
          maxLength={MAX_QUERY_LENGTH}
          className={INPUT}
          autoFocus
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">In</span>
          <select name="forum" defaultValue="" className={INPUT}>
            <option value="">Every forum I can see</option>
            {forums.map((forum) => (
              <option key={forum.id} value={forum.id}>
                {forum.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Sort by</span>
          <select name="sort" defaultValue="relevance" className={INPUT}>
            <option value="relevance">Best match</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      <div>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Search
        </button>
      </div>
    </form>
  )
}
