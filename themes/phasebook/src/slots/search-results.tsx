import type { SearchResultsModel } from '@meith/theme-kit'

import { FEED, LINK, PAGE, PILL, PILL_PRIMARY, Stamp } from '../shared'

export function SearchResults({
  terms,
  searchedAt,
  hits,
  nextHref,
  nextLabel,
  newSearchHref,
  within,
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
