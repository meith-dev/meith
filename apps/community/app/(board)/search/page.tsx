import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { isInSubtree } from '@meith/forums'
import type { Translator } from '@meith/i18n'
import {
  MAX_QUERY_LENGTH,
  readGrouping,
  readMatch,
  readPeriod,
  readSort,
  SEARCH_GROUPINGS,
  SEARCH_MATCHES,
  SEARCH_PERIODS,
  SEARCH_SORTS,
  type SearchFilterSet,
} from '@meith/search'
import {
  type OptionModel,
  requireSlot,
  type SearchAdvancedModel,
  type SearchFormModel,
  slotCopy,
} from '@meith/theme-kit'

import { SearchOffNotice } from '@/components/board/search-off-notice'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { SEARCH_OFF_MESSAGE, searchEnabled } from '@/server/search'
import { MAX_AUTHOR_NAMES, type RunSearchOutcome, runSearch } from '@/server/search-page'
import { currentSessionKey } from '@/server/session-key'
import { currentTheme } from '@/server/theme'
import {
  choiceOptions,
  GROUPING_LABEL_KEYS,
  MATCH_LABEL_KEYS,
  PERIOD_LABEL_KEYS,
  SEARCH_FIELDS,
  SORT_LABEL_KEYS,
  SUBFORUMS_ON,
} from '@/view/search-controls'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.search') }
}

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
  const translator = await getTranslator()

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
            errorMessage: errorFor(outcome, translator),
          }))}
          copy={slotCopy(await currentTheme(), 'SearchForm', translator)}
        />
      </Page>
    )
  }

  return (
    <Page>
      <SearchForm
        {...(await filteredForm({
          ...(await formModel(submitted)),
          hint: translator.t('board.search.hint'),
          errorMessage: null,
        }))}
        copy={slotCopy(await currentTheme(), 'SearchForm', translator)}
      />
    </Page>
  )
}

async function Page({ children }: { children: React.ReactNode }) {
  const translator = await getTranslator()
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 flex-1"
    >
      <h1 className="font-heading text-2xl font-semibold">{translator.t('board.search.title')}</h1>
      {children}
    </main>
  )
}

function errorFor(outcome: Exclude<RunSearchOutcome, { kind: 'ok' }>, t: Translator): string {
  if (outcome.kind === 'flooded') {
    return t.t('board.search.flooded', { seconds: outcome.seconds })
  }
  if (outcome.kind === 'limited') return outcome.message
  if (outcome.kind === 'unknown-author')
    return t.t('board.search.unknownAuthor', { name: outcome.name })
  if (outcome.reason === 'too-short') {
    return t.t('board.search.tooShort', { count: outcome.minWordLength })
  }
  if (outcome.reason === 'too-long') return t.t('board.search.tooLong')
  return t.t('board.search.empty')
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
  const t = await getTranslator()

  const forums: OptionModel[] = [
    { value: '', label: t.t('search.everyVisibleForum'), isSelected: chosen === '' },
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
    sorts: choiceOptions(SEARCH_SORTS, SORT_LABEL_KEYS, submitted.filters.sort, t),
    advanced: advancedModel(submitted, t),
  }
}

function advancedModel(submitted: Submitted, t: Translator): SearchAdvancedModel {
  const { filters } = submitted

  return {
    label: t.t('search.advanced'),
    isOpen:
      submitted.authors !== '' ||
      submitted.subforums ||
      filters.period !== 'any' ||
      filters.match !== 'everything' ||
      filters.grouping !== 'posts',
    author: {
      field: SEARCH_FIELDS.author,
      label: t.t('search.postedBy'),
      value: submitted.authors,
      placeholder: t.t('search.anybody'),
      hint: t.t('board.search.authorHint', { count: MAX_AUTHOR_NAMES }),
    },
    toggles: [
      {
        field: SEARCH_FIELDS.subforums,
        value: SUBFORUMS_ON,
        label: t.t('search.includeSubforums'),
        isOn: submitted.subforums,
      },
    ],
    choices: [
      {
        field: SEARCH_FIELDS.period,
        label: t.t('search.posted'),
        options: choiceOptions(SEARCH_PERIODS, PERIOD_LABEL_KEYS, filters.period, t),
      },
      {
        field: SEARCH_FIELDS.match,
        label: t.t('search.matchingIn'),
        options: choiceOptions(SEARCH_MATCHES, MATCH_LABEL_KEYS, filters.match, t),
      },
      {
        field: SEARCH_FIELDS.grouping,
        label: t.t('search.show'),
        options: choiceOptions(SEARCH_GROUPINGS, GROUPING_LABEL_KEYS, filters.grouping, t),
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
