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
  NativeSelect,
  buttonVariants,
} from '@meith/ui'
import type { OptionModel, SearchRefineModel, SearchResultsModel } from '@meith/theme-kit'

import { LINK, Stamp, pageAt } from '../shared'

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

      {refine !== undefined && <Refine {...refine} />}

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
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-heading text-sm font-semibold text-foreground">{label}</h2>
            <p className="text-sm text-muted-foreground">{summary}</p>
          </div>

          {clearHref !== null && (
            <a href={clearHref} className={`text-sm font-medium text-foreground ${LINK}`}>
              Clear filters
            </a>
          )}
        </div>

        {note !== null && <p className="text-xs text-muted-foreground">{note}</p>}

        {applied.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {applied.map((chip) => (
              <li key={chip.label}>
                <a
                  href={chip.removeHref}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  {chip.label}
                  <span aria-hidden="true">×</span>
                  <span className="sr-only">— remove this filter</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <form method="get" action={action} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {choices.map((choice) => (
              <Choice
                key={choice.field}
                label={choice.label}
                name={choice.field}
                options={choice.options}
              />
            ))}
          </div>

          <div>
            <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
              {submitLabel}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Choice({
  label,
  name,
  options,
}: {
  label: string
  name: string
  options: readonly OptionModel[]
}) {
  const selected = options.find((option) => option.isSelected)

  return (
    <Field name={name} label={label}>
      {(control) => (
        <NativeSelect {...control} defaultValue={selected?.value ?? ''}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      )}
    </Field>
  )
}
