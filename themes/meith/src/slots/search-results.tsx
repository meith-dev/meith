import type { OptionModel, SearchRefineModel, SearchResultsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Field, Input, NativeSelect, NavTabs } from '@meith/ui'

import {
  Arrow,
  EDITORIAL_RULE,
  ITEM_TITLE,
  LABEL,
  LEDE,
  META,
  PAGE_TITLE,
  PRIMARY_ACTION,
  QUIET_LINK,
  RULE,
  SECONDARY_ACTION,
  SHELL,
  Stamp,
  TEXT_LINK,
  TOUCH,
} from '../shared'

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
  const c = (key: string) => fromSlotCopy(copy, `meith.searchResults.${key}`)

  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={`${SHELL} flex max-w-3xl flex-1 flex-col gap-8 py-8`}
    >
      <div className="flex flex-col gap-2">
        <h1 className={`${PAGE_TITLE} [overflow-wrap:anywhere]`}>
          {c('resultsFor')} {c('openQuote')}
          {terms}
          {c('closeQuote')}
        </h1>
        <p className={LEDE}>
          {c('searched')} <Stamp at={searchedAt} />. {c('searchedNote')}
        </p>
      </div>

      {refine !== undefined && <Refine {...refine} copy={copy} />}

      <section className={EDITORIAL_RULE}>
        {hits.length === 0 ? (
          <div className="flex flex-col gap-1 py-5">
            <p className={ITEM_TITLE}>{c('nothingMatched')}</p>
            <p className={META}>{c('tryFewerWords')}</p>
          </div>
        ) : (
          <ul>
            {hits.map((hit) => (
              <li key={hit.postId} className={`${RULE} flex flex-col gap-1 py-4 first:border-t-0`}>
                <a href={hit.href} className={`${ITEM_TITLE} ${QUIET_LINK}`}>
                  {hit.threadTitle}
                </a>
                <p
                  className={`${META} [&_b]:font-medium [&_b]:text-foreground`}
                  dangerouslySetInnerHTML={{ __html: hit.excerptHtml }}
                />
                <p className={META}>
                  {hit.authorUsername} {c('dot')} <Stamp at={hit.postedAt} />
                </p>
              </li>
            ))}
          </ul>
        )}

        {regions?.pagination !== undefined ? (
          <div className={`${RULE} pt-4`}>{regions.pagination}</div>
        ) : (
          nextHref !== null && (
            <p className={`${RULE} pt-4`}>
              <a
                href={nextHref}
                className={`group text-[0.8125rem] font-medium text-foreground ${TEXT_LINK}`}
              >
                {nextLabel}
                <Arrow />
              </a>
            </p>
          )
        )}
      </section>

      <section aria-label={within.label} className={`${EDITORIAL_RULE} pt-5`}>
        <form method="get" action={within.action} className="flex flex-col gap-5">
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

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className={PRIMARY_ACTION}>
              {within.submitLabel}
              <span
                aria-hidden="true"
                className="inline-block text-[1.2em] leading-none transition-transform duration-[160ms] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
              >
                ↗
              </span>
            </button>
            <a href={newSearchHref} className={SECONDARY_ACTION}>
              {c('startNewSearch')}
            </a>
          </div>
        </form>
      </section>
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
  const c = (key: string) => fromSlotCopy(copy, `meith.searchResults.${key}`)

  return (
    <section aria-label={label} className={`${EDITORIAL_RULE} flex flex-col gap-4 pt-4`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className={ITEM_TITLE}>{summary}</p>

        <NavTabs label={sortsLabel} tabs={sorts} />

        {applied.map((chip) => (
          <a
            key={chip.label}
            href={chip.removeHref}
            className={`${LABEL} inline-flex items-center gap-1.5 border-b border-primary/60 pb-0.5 text-foreground ${QUIET_LINK} ${TOUCH}`}
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
        className={`${RULE} grid grid-cols-1 items-end gap-4 pt-4 sm:grid-cols-2`}
      >
        {choices.map((choice) => (
          <Filter
            key={choice.field}
            label={choice.label}
            name={choice.field}
            options={choice.options}
          />
        ))}

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className={SECONDARY_ACTION}>
            {submitLabel}
          </button>

          {clearHref !== null && (
            <a
              href={clearHref}
              className={`text-[0.8125rem] font-medium text-foreground ${TEXT_LINK}`}
            >
              {c('clearFilters')}
            </a>
          )}
        </div>
      </form>

      {note !== null && <p className={META}>{note}</p>}
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
      <label htmlFor={id} className={LABEL}>
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
