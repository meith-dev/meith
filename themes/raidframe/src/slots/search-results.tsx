import type { SearchResultsModel } from '@meith/theme-kit'

import { BUTTON_PRIMARY, Frame, HEADING, MICRO, PanelHead, RULE, Stamp } from '../shared'

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
              className="w-full border border-input bg-surface px-3 py-2 text-sm text-foreground focus-visible:border-ring"
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
