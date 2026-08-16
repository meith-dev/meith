import {
  requireSlot,
  type OptionModel,
  type SearchAdvancedModel,
  type SearchFormModel,
} from '@meith/theme-kit'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { isInSubtree } from '@meith/forums'
import {
  MAX_QUERY_LENGTH,
  SEARCH_GROUPINGS,
  SEARCH_MATCHES,
  SEARCH_PERIODS,
  SEARCH_SORTS,
  readGrouping,
  readMatch,
  readPeriod,
  readSort,
  type SearchFilterSet,
} from '@meith/search'

import { SearchOffNotice } from '@/components/board/search-off-notice'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { SEARCH_OFF_MESSAGE, searchEnabled } from '@/server/search'
import { MAX_AUTHOR_NAMES, runSearch, type RunSearchOutcome } from '@/server/search-page'
import { currentSessionKey } from '@/server/session-key'
import { currentTheme } from '@/server/theme'
import { filterView, viewerRef } from '@/server/plugin-view'
import {
  GROUPING_LABELS,
  MATCH_LABELS,
  PERIOD_LABELS,
  SEARCH_FIELDS,
  SORT_LABELS,
  SUBFORUMS_ON,
  choiceOptions,
} from '@/view/search-controls'

export const metadata: Metadata = { title: 'Search' }

const HINT =
  'Searches every forum you can see. Put a phrase in quotes to match it exactly, ' +
  'and put a minus in front of a word to exclude it.'

const AUTHOR_HINT = `Usernames, separated by commas. Up to ${MAX_AUTHOR_NAMES}.`

interface Submitted {
  readonly terms: string
  readonly forums: readonly string[]
  readonly subforums: boolean
  readonly authors: string
  readonly filters: Omit<SearchFilterSet, 'authorUserIds' | 'authorNames' | 'forumIds'>
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await searchEnabled())) return <SearchOffNotice message={SEARCH_OFF_MESSAGE} />

  const params = await searchParams
  const submitted = read(params)

  const actor = await getActor()
  const SearchForm = requireSlot(await currentTheme(), 'SearchForm')

  if (submitted.terms !== '') {
    const outcome = await runSearch({
      actor,
      sessionKey: await currentSessionKey(),
      terms: submitted.terms,
      authors: submitted.authors,
      filters: {
        ...submitted.filters,
        ...(await chosenForums(submitted)),
      },
    })

    if (outcome.kind === 'ok') redirect(`/search/${outcome.token}`)

    return (
      <Page>
        <SearchForm
          {...(await filteredForm({
            ...(await formModel(submitted)),
            hint: null,
            errorMessage: errorFor(outcome),
          }))}
        />
      </Page>
    )
  }

  return (
    <Page>
      <SearchForm
        {...(await filteredForm({
          ...(await formModel(submitted)),
          hint: HINT,
          errorMessage: null,
        }))}
      />
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 flex-1"
    >
      <h1 className="font-heading text-2xl font-semibold">Search</h1>
      {children}
    </main>
  )
}

function errorFor(outcome: Exclude<RunSearchOutcome, { kind: 'ok' }>): string {
  if (outcome.kind === 'flooded') {
    return `You are searching very quickly. Try again in ${outcome.seconds} seconds.`
  }
  if (outcome.kind === 'limited') return outcome.message
  if (outcome.kind === 'unknown-author') return `Nobody here is called “${outcome.name}”.`
  if (outcome.reason === 'too-short') return 'That search is too short — try a whole word.'
  if (outcome.reason === 'too-long') return 'That search is too long to run.'
  return 'Type something to search for.'
}

function read(params: Record<string, string | string[] | undefined>): Submitted {
  const many = (key: string): readonly string[] => {
    const raw = params[key]
    if (raw === undefined) return []
    return (Array.isArray(raw) ? raw : [raw]).filter((value) => value !== '')
  }
  const one = (key: string): string => many(key)[0] ?? ''

  return {
    terms: one(SEARCH_FIELDS.query),
    forums: many(SEARCH_FIELDS.forum),
    subforums: one(SEARCH_FIELDS.subforums) === SUBFORUMS_ON,
    authors: one(SEARCH_FIELDS.author),
    filters: {
      sort: readSort(one(SEARCH_FIELDS.sort)),
      match: readMatch(one(SEARCH_FIELDS.match)),
      grouping: readGrouping(one(SEARCH_FIELDS.grouping)),
      period: readPeriod(one(SEARCH_FIELDS.period)),
    },
  }
}

async function chosenForums(
  submitted: Submitted,
): Promise<{ readonly forumIds?: readonly number[] }> {
  const wanted = submitted.forums
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0)

  if (wanted.length === 0) return {}

  const visible = await visibleForums()
  const roots = visible.filter((forum) => wanted.includes(forum.id))

  const ids = submitted.subforums
    ? visible
        .filter((forum) => roots.some((root) => isInSubtree(forum.path, root.path)))
        .map((forum) => forum.id)
    : roots.map((forum) => forum.id)

  return { forumIds: ids.length === 0 ? wanted : ids }
}

async function formModel(
  submitted: Submitted,
): Promise<Omit<SearchFormModel, 'hint' | 'errorMessage'>> {
  const chosen = submitted.forums[0] ?? ''

  const forums: OptionModel[] = [
    { value: '', label: 'Every forum I can see', isSelected: chosen === '' },
  ]
  for (const visible of await visibleForums()) {
    forums.push({
      value: String(visible.id),
      label: `${'\u00a0\u00a0'.repeat(visible.depth)}${visible.title}`,
      isSelected: String(visible.id) === chosen,
    })
  }

  return {
    action: '/search',
    fields: {
      query: SEARCH_FIELDS.query,
      forum: SEARCH_FIELDS.forum,
      sort: SEARCH_FIELDS.sort,
    },
    query: submitted.terms,
    maxQueryLength: MAX_QUERY_LENGTH,
    forums,
    sorts: choiceOptions(SEARCH_SORTS, SORT_LABELS, submitted.filters.sort),
    advanced: advancedModel(submitted),
  }
}

function advancedModel(submitted: Submitted): SearchAdvancedModel {
  const { filters } = submitted

  return {
    label: 'Advanced options',
    isOpen:
      submitted.authors !== '' ||
      submitted.subforums ||
      filters.period !== 'any' ||
      filters.match !== 'everything' ||
      filters.grouping !== 'posts',
    author: {
      field: SEARCH_FIELDS.author,
      label: 'Posted by',
      value: submitted.authors,
      placeholder: 'Anybody',
      hint: AUTHOR_HINT,
    },
    toggles: [
      {
        field: SEARCH_FIELDS.subforums,
        value: SUBFORUMS_ON,
        label: 'Include subforums of the forum above',
        isOn: submitted.subforums,
      },
    ],
    choices: [
      {
        field: SEARCH_FIELDS.period,
        label: 'Posted',
        options: choiceOptions(SEARCH_PERIODS, PERIOD_LABELS, filters.period),
      },
      {
        field: SEARCH_FIELDS.match,
        label: 'Matching in',
        options: choiceOptions(SEARCH_MATCHES, MATCH_LABELS, filters.match),
      },
      {
        field: SEARCH_FIELDS.grouping,
        label: 'Show',
        options: choiceOptions(SEARCH_GROUPINGS, GROUPING_LABELS, filters.grouping),
      },
    ],
  }
}

async function filteredForm(model: SearchFormModel): Promise<SearchFormModel> {
  return filterView('view.search-form', model, viewerRef(await getActor()))
}

async function visibleForums(): Promise<
  readonly { id: number; title: string; path: string; depth: number }[]
> {
  const actor = await getActor()
  const { authorizer, forums } = getContainer()

  const allowed = new Set(await authorizer.forumIdsWhere(actor, 'thread.view'))
  return (await forums.listAll())
    .filter((forum) => allowed.has(forum.id) && forum.type === 'forum')
    .map((forum) => ({
      id: forum.id,
      title: forum.title,
      path: forum.path,
      depth: forum.depth,
    }))
}
