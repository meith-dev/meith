import type { OptionModel, SearchRefineModel, SearchResultsModel } from '@meith/theme-kit'

import { FEED, LINK, PAGE, PILL, PILL_PRIMARY, Stamp } from '../shared'

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

        {regions?.pagination ??
          (nextHref !== null && (
            <a href={nextHref} className={PILL}>
              {nextLabel} →
            </a>
          ))}

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
      className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-4 py-3 shadow-elevation"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-semibold text-foreground">{summary}</p>

        <nav
          aria-label={sortsLabel}
          className="flex items-center rounded-full border border-border p-0.5"
        >
          {sorts.map((sort) => (
            <a
              key={sort.label}
              href={sort.href}
              {...(sort.isCurrent ? { 'aria-current': 'true' as const } : {})}
              className={
                sort.isCurrent
                  ? 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                  : 'rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground'
              }
            >
              {sort.label}
            </a>
          ))}
        </nav>

        {applied.map((chip) => (
          <a
            key={chip.label}
            href={chip.removeHref}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-foreground hover:bg-primary/20"
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

        <button type="submit" className={`${PILL} h-8 px-3 text-xs`}>
          {submitLabel}
        </button>

        {clearHref !== null && (
          <a href={clearHref} className={`text-xs font-semibold ${LINK}`}>
            Clear filters
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
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        name={field}
        defaultValue={selected?.value ?? ''}
        className="h-8 rounded-lg border border-input bg-surface px-2 text-xs text-foreground transition-colors focus-visible:border-ring"
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
