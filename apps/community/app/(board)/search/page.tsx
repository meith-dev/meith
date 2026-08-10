import { requireSlot, type OptionModel, type SearchFormModel } from '@meith/theme-kit'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { MAX_QUERY_LENGTH } from '@meith/search'

import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { runSearch, type SearchFilters } from '@/server/search-page'
import { currentSessionKey } from '@/server/session-key'
import { currentTheme } from '@/server/theme'
import { filterView, viewerRef } from '@/server/plugin-view'

export const metadata: Metadata = { title: 'Search' }

const FIELDS = { query: 'q', forum: 'forum', sort: 'sort' } as const

const SORTS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
]

const HINT =
  'Searches every forum you can see. Put a phrase in quotes to match it exactly, ' +
  'and put a minus in front of a word to exclude it.'

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
  const terms = value(FIELDS.query)
  const forum = value(FIELDS.forum)
  const sort = value(FIELDS.sort)

  const SearchForm = requireSlot(await currentTheme(), 'SearchForm')

  if (terms !== '') {
    const filters: SearchFilters = {
      sort: sort === 'newest' || sort === 'oldest' ? sort : 'relevance',
      ...(forum === '' ? {} : { forumIds: [Number(forum)] }),
    }

    const outcome = await runSearch({
      actor,
      sessionKey: await currentSessionKey(),
      terms,
      filters,
    })

    if (outcome.kind === 'ok') redirect(`/search/${outcome.token}`)

    return (
      <main id="board-content" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 flex-1">
        <h1 className="font-heading text-2xl font-semibold">Search</h1>
        <SearchForm
          {...(await filteredForm({
            ...(await formModel({ terms, forum, sort })),
            hint: null,
            errorMessage:
              outcome.kind === 'flooded'
                ? `You are searching very quickly. Try again in ${outcome.seconds} seconds.`
                :
                  outcome.kind === 'limited'
                  ? outcome.message
                  : outcome.reason === 'too-short'
                    ? 'That search is too short — try a whole word.'
                    : outcome.reason === 'too-long'
                      ? 'That search is too long to run.'
                      : 'Type something to search for.',
          }))}
        />
      </main>
    )
  }

  return (
    <main id="board-content" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 flex-1">
      <h1 className="font-heading text-2xl font-semibold">Search</h1>
      <SearchForm
        {...(await filteredForm({
          ...(await formModel({ terms: '', forum, sort })),
          hint: HINT,
          errorMessage: null,
        }))}
      />
    </main>
  )
}

async function formModel({
  terms,
  forum,
  sort,
}: {
  terms: string
  forum: string
  sort: string
}): Promise<Omit<SearchFormModel, 'hint' | 'errorMessage'>> {
  const forums: OptionModel[] = [
    { value: '', label: 'Every forum I can see', isSelected: forum === '' },
  ]
  for (const visible of await visibleForums()) {
    forums.push({
      value: String(visible.id),
      label: visible.title,
      isSelected: String(visible.id) === forum,
    })
  }

  const known = SORTS.some((option) => option.value === sort)
  const sorts = SORTS.map((option) => ({
    ...option,
    isSelected: known ? option.value === sort : option.value === 'relevance',
  }))

  return {
    action: '/search',
    fields: FIELDS,
    query: terms,
    maxQueryLength: MAX_QUERY_LENGTH,
    forums,
    sorts,
  }
}

async function filteredForm(model: SearchFormModel): Promise<SearchFormModel> {
  return filterView('view.search-form', model, viewerRef(await getActor()))
}

async function visibleForums(): Promise<readonly { id: number; title: string }[]> {
  const actor = await getActor()
  const { authorizer, forums } = getContainer()

  const allowed = new Set(await authorizer.forumIdsWhere(actor, 'thread.view'))
  return (await forums.listAll())
    .filter((forum) => allowed.has(forum.id) && forum.type === 'forum')
    .map((forum) => ({ id: forum.id, title: forum.title }))
}
