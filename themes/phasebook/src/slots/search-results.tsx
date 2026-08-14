import type { OptionModel, SearchRefineModel, SearchResultsModel } from '@meith/theme-kit'

import { FEED, LINK, PAGE, PILL, PILL_PRIMARY, Stamp } from '../shared'

const LABEL = 'mb-1 block text-sm font-semibold text-foreground'

const SELECT =
  'w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground transition-colors focus-visible:border-ring'

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
    <main id="board-content" tabIndex={-1} className={`${PAGE} flex-1 py-4 sm:py-6`}>
      <div className={`${FEED} flex flex-col gap-4`}>
        <header className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-elevation">
          <h1 className="text-xl leading-tight font-bold tracking-tight text-balance">
            Results for &ldquo;{terms}&rdquo;
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Searched <Stamp at={searchedAt} />. Results are checked against your access
            every time this page is opened, so they can change.
          </p>
        </header>

        {refine !== undefined && <Refine {...refine} />}

        {hits.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground shadow-elevation">
            Nothing matched — or nothing you can see does. Try fewer words, or a different
            spelling.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {hits.map((hit) => (
              <li
                key={hit.postId}
                className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-elevation"
              >
                <a href={hit.href} className="text-[0.9375rem] font-semibold hover:underline">
                  {hit.threadTitle}
                </a>
                <p
                  className="mt-1 text-sm text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground"
                  dangerouslySetInnerHTML={{ __html: hit.excerptHtml }}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {hit.authorUsername} · <Stamp at={hit.postedAt} />
                </p>
              </li>
            ))}
          </ul>
        )}

        {nextHref !== null && (
          <a href={nextHref} className={PILL}>
            {nextLabel} →
          </a>
        )}

        <section className="rounded-lg border border-border bg-card shadow-elevation">
          <form
            method="get"
            action={within.action}
            className="flex flex-col gap-3 px-4 py-4"
          >
            {(within.hidden ?? []).map((field) => (
              <input
                key={`${field.name}-${field.value}`}
                type="hidden"
                name={field.name}
                value={field.value}
              />
            ))}

            <div>
              <label
                htmlFor="search-within"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {within.label}
              </label>
              <input
                id="search-within"
                type="search"
                name={within.field}
                defaultValue={within.value}
                autoComplete="off"
                aria-describedby="search-within-hint"
                className="w-full rounded-full border border-input bg-surface px-4 py-2.5 text-sm text-foreground transition-colors focus-visible:border-ring"
              />
              <p id="search-within-hint" className="mt-1.5 text-xs text-muted-foreground">
                {within.hint}
              </p>
            </div>

            <div>
              <button type="submit" className={PILL_PRIMARY}>
                {within.submitLabel}
              </button>
            </div>
          </form>
        </section>

        <a href={newSearchHref} className={`text-sm font-semibold ${LINK}`}>
          Start a new search
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
  choices,
  submitLabel,
  applied,
  clearHref,
}: SearchRefineModel) {
  return (
    <section
      aria-labelledby="search-refine"
      className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-elevation"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="search-refine" className="text-sm font-semibold">
            {label}
          </h2>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>

        {clearHref !== null && (
          <a href={clearHref} className={`text-sm font-semibold ${LINK}`}>
            Clear filters
          </a>
        )}
      </div>

      {note !== null && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}

      {applied.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {applied.map((chip) => (
            <li key={chip.label}>
              <a
                href={chip.removeHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted"
              >
                {chip.label}
                <span aria-hidden="true">×</span>
                <span className="sr-only">— remove this filter</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <form method="get" action={action} className="mt-3 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {choices.map((choice) => (
            <RefineChoice key={choice.field} {...choice} />
          ))}
        </div>

        <div>
          <button type="submit" className={PILL}>
            {submitLabel}
          </button>
        </div>
      </form>
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
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} name={field} defaultValue={selected?.value ?? ''} className={SELECT}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
