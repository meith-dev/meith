import {
  Card,
  CardContent,
  CardFooter,
  CardRows,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Field,
  Input,
  buttonVariants,
} from '@meith/ui'
import type { SearchResultsModel } from '@meith/theme-kit'

import { LINK, Stamp, pageAt } from '../shared'

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
      className={`${pageAt('max-w-3xl')} flex flex-1 flex-col gap-6 py-8`}
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">
          Results for &ldquo;{terms}&rdquo;
        </h1>
        <p className="text-sm text-muted-foreground">
          Searched <Stamp at={searchedAt} />. Results are checked against your access
          every time this page is opened, so they can change.
        </p>
      </div>

      <Card>
        {hits.length === 0 ? (
          <Empty>
            <EmptyTitle>Nothing matched.</EmptyTitle>
            <EmptyDescription>
              Or nothing you can see does. Try fewer words, or a different spelling.
            </EmptyDescription>
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
                  {hit.authorUsername} · <Stamp at={hit.postedAt} />
                </p>
              </li>
            ))}
          </CardRows>
        )}

        {nextHref !== null && (
          <CardFooter>
            <a href={nextHref} className={`font-medium text-foreground ${LINK}`}>
              {nextLabel} →
            </a>
          </CardFooter>
        )}
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form method="get" action={within.action} className="flex flex-col gap-4">
            <Field name={within.field} label={within.label} description={within.hint}>
              {(control) => (
                <Input
                  {...control}
                  defaultValue={within.value}
                  type="search"
                  autoComplete="off"
                />
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

      <a href={newSearchHref} className={`text-sm font-medium text-foreground ${LINK}`}>
        Start a new search
      </a>
    </main>
  )
}
