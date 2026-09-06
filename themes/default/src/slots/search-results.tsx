import type { OptionModel, SearchRefineModel, SearchResultsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import {
  buttonVariants,
  Card,
  CardContent,
  CardFooter,
  CardRows,
  cn,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Field,
  Input,
  NativeSelect,
  NavTabs,
  PageDescription,
  PageHeader,
  PageHeaderContent,
  PageTitle,
} from '@meith/ui'

import { LINK, pageAt, Stamp } from '../shared'

export function SearchResults({
  terms,
  searchedAt,
  hits,
  nextHref,
  nextLabel,
  newSearchHref,
  within,
  refine,
  regions,
  copy,
}: SearchResultsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.searchResults.${key}`)

  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={`${pageAt('max-w-3xl')} flex flex-1 flex-col gap-6 py-8`}
    >
      <PageHeader>
        <PageHeaderContent>
          <PageTitle>
            {c('resultsFor')} {c('openQuote')}
            {terms}
            {c('closeQuote')}
          </PageTitle>
          <PageDescription>
            {c('searched')} <Stamp at={searchedAt} />. {c('searchedNote')}
          </PageDescription>
        </PageHeaderContent>
      </PageHeader>

      {refine !== undefined && <Refine {...refine} copy={copy} />}

      <Card>
        {hits.length === 0 ? (
          <Empty>
            <EmptyTitle>{c('nothingMatched')}</EmptyTitle>
            <EmptyDescription>{c('tryFewerWords')}</EmptyDescription>
          </Empty>
        ) : (
          <CardRows>
            {hits.map((hit) => (
              <li key={hit.postId} className="flex flex-col gap-1 px-4 py-3">
                <a href={hit.href} className={`text-sm font-medium text-foreground ${LINK}`}>
                  {hit.threadTitle}
                </a>
                <p
                  className="text-sm text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground"
                  dangerouslySetInnerHTML={{ __html: hit.excerptHtml }}
                />
                <p className="text-xs text-muted-foreground">
                  {hit.authorUsername} {c('dot')} <Stamp at={hit.postedAt} />
                </p>
              </li>
            ))}
          </CardRows>
        )}

        {regions?.pagination !== undefined ? (
          <CardFooter>{regions.pagination}</CardFooter>
        ) : (
          nextHref !== null && (
            <CardFooter>
              <a href={nextHref} className={`font-medium text-foreground ${LINK}`}>
                {nextLabel} {c('nextArrow')}
              </a>
            </CardFooter>
          )
        )}
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form method="get" action={within.action} className="flex flex-col gap-4">
            {(within.hidden ?? []).map((field) => (
              <input
                key={`${field.name}-${field.value}`}
                type="hidden"
                name={field.name}
                value={field.value}
              />
            ))}

            <Field name={within.field} label={within.label} description={within.hint}>
              {(control) => (
                <Input {...control} defaultValue={within.value} type="search" autoComplete="off" />
              )}
            </Field>

            <div>
              <button type="submit" className={buttonVariants({ variant: 'primary' })}>
                {within.submitLabel}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <a href={newSearchHref} className={buttonVariants({ variant: 'outline' })}>
          {c('startNewSearch')}
        </a>
      </div>
    </main>
  )
}

function Refine({
  action,
  label,
  summary,
  note,
  sorts,
  sortsLabel,
  choices,
  submitLabel,
  applied,
  clearHref,
  copy,
}: SearchRefineModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.searchResults.${key}`)

  return (
    <section
      aria-label={label}
      className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-medium text-foreground">{summary}</p>

        <NavTabs label={sortsLabel} tabs={sorts} />

        {applied.map((chip) => (
          <a
            key={chip.label}
            href={chip.removeHref}
            className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-primary/20"
          >
            {chip.label}
            <span aria-hidden="true">{c('removeFilterX')}</span>
            <span className="sr-only">{c('removeFilter')}</span>
          </a>
        ))}
      </div>

      <form
        method="get"
        action={action}
        className="grid grid-cols-1 items-end gap-3 border-t border-border pt-3 sm:grid-cols-2"
      >
        {choices.map((choice) => (
          <Filter
            key={choice.field}
            label={choice.label}
            name={choice.field}
            options={choice.options}
          />
        ))}

        <button
          type="submit"
          className={cn(buttonVariants({ variant: 'secondary' }), 'justify-self-start')}
        >
          {submitLabel}
        </button>

        {clearHref !== null && (
          <a href={clearHref} className={`text-xs font-medium text-foreground ${LINK}`}>
            {c('clearFilters')}
          </a>
        )}
      </form>

      {note !== null && <p className="text-xs text-muted-foreground">{note}</p>}
    </section>
  )
}

function Filter({
  label,
  name,
  options,
}: {
  label: string
  name: string
  options: readonly OptionModel[]
}) {
  const selected = options.find((option) => option.isSelected)
  const id = `filter-${name}`

  return (
    <span className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <NativeSelect id={id} name={name} defaultValue={selected?.value ?? ''} className="w-full">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </span>
  )
}
