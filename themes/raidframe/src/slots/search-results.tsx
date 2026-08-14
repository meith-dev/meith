import type { OptionModel, SearchRefineModel, SearchResultsModel } from '@meith/theme-kit'

import { BUTTON_PRIMARY, Frame, HEADING, MICRO, RULE, Stamp } from '../shared'

const CONTROL =
  'w-full border border-input bg-surface px-3 py-2 text-sm text-foreground focus-visible:border-ring'

export function SearchResults({
  terms,
  searchedAt,
  hits,
  nextHref,
  nextLabel,
  newSearchHref,
  within,
  refine,
}: SearchResultsModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4"
    >
      <div className="border border-border bg-card shadow-elevation">
        <div className="px-4 py-3">
          <p className={MICRO}>search</p>
          <h1 className={`${HEADING} text-xl text-foreground`}>
            Results for &ldquo;{terms}&rdquo;
          </h1>
          <p className={`${MICRO} mt-1 normal-case`}>
            <span className="uppercase">run</span> <Stamp at={searchedAt} />
            <span className="text-border">{' | '}</span>
            <span>checked against your access every time this page is opened</span>
          </p>
        </div>
        <div className={RULE} aria-hidden="true" />
      </div>

      {refine !== undefined && <Refine {...refine} />}

      <Frame>
        {hits.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className={`${HEADING} text-sm text-foreground`}>Nothing matched</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Or nothing you can see does. Try fewer words, or a different spelling.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {hits.map((hit) => (
              <li key={hit.postId} className="flex flex-col gap-1 px-4 py-3 hover:bg-secondary/50">
                <a href={hit.href} className="text-sm font-medium text-foreground hover:text-primary">
                  {hit.threadTitle}
                </a>
                <p
                  className="text-sm text-muted-foreground [&_b]:font-semibold [&_b]:text-primary"
                  dangerouslySetInnerHTML={{ __html: hit.excerptHtml }}
                />
                <p className={`${MICRO} normal-case`}>
                  {hit.authorUsername}
                  <span className="text-border">{' | '}</span>
                  <Stamp at={hit.postedAt} />
                </p>
              </li>
            ))}
          </ul>
        )}

        {nextHref !== null && (
          <p className="border-t border-border px-4 py-2">
            <a href={nextHref} className={`${MICRO} hover:text-primary`}>
              {nextLabel} →
            </a>
          </p>
        )}
      </Frame>

      <Frame>
        <form method="get" action={within.action} className="flex flex-col gap-3 px-4 py-4">
          {(within.hidden ?? []).map((field) => (
            <input
              key={`${field.name}-${field.value}`}
              type="hidden"
              name={field.name}
              value={field.value}
            />
          ))}

          <div>
            <label htmlFor="search-within" className={`${MICRO} mb-1 block`}>
              {within.label}
            </label>
            <input
              id="search-within"
              type="search"
              name={within.field}
              defaultValue={within.value}
              autoComplete="off"
              aria-describedby="search-within-hint"
              className={CONTROL}
            />
            <p id="search-within-hint" className="mt-1.5 text-xs text-muted-foreground">
              {within.hint}
            </p>
          </div>

          <div>
            <button type="submit" className={BUTTON_PRIMARY}>
              {within.submitLabel}
            </button>
          </div>
        </form>
      </Frame>

      <p>
        <a href={newSearchHref} className={`${MICRO} hover:text-primary`}>
          start a new search
        </a>
      </p>
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
}: SearchRefineModel) {
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-2.5 border border-border bg-card px-4 py-3 shadow-elevation"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-medium text-foreground">{summary}</p>

        <nav aria-label={sortsLabel} className="flex items-center gap-1">
          {sorts.map((sort) => (
            <a
              key={sort.label}
              href={sort.href}
              {...(sort.isCurrent ? { 'aria-current': 'true' as const } : {})}
              className={`${MICRO} border px-2 py-1 ${
                sort.isCurrent
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent hover:text-primary'
              }`}
            >
              {sort.label}
            </a>
          ))}
        </nav>

        {applied.map((chip) => (
          <a
            key={chip.label}
            href={chip.removeHref}
            className={`${MICRO} inline-flex items-center gap-1.5 border border-primary bg-primary/10 px-2 py-1 normal-case text-primary hover:bg-primary/20`}
          >
            {chip.label}
            <span aria-hidden="true">×</span>
            <span className="sr-only">— remove this filter</span>
          </a>
        ))}
      </div>

      <form
        method="get"
        action={action}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-2.5"
      >
        {choices.map((choice) => (
          <RefineChoice key={choice.field} {...choice} />
        ))}

        <button type="submit" className={`${BUTTON_PRIMARY} h-8 px-3`}>
          {submitLabel}
        </button>

        {clearHref !== null && (
          <a href={clearHref} className={`${MICRO} hover:text-primary`}>
            clear filters
          </a>
        )}
      </form>

      {note !== null && <p className="text-xs text-muted-foreground">{note}</p>}
    </section>
  )
}

function RefineChoice({
  field,
  label,
  options,
}: {
  field: string
  label: string
  options: readonly OptionModel[]
}) {
  const selected = options.find((option) => option.isSelected)
  const id = `search-refine-${field}`

  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={id} className={MICRO}>
        {label}
      </label>
      <select
        id={id}
        name={field}
        defaultValue={selected?.value ?? ''}
        className="h-8 border border-input bg-surface px-2 text-xs text-foreground focus-visible:border-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  )
}
