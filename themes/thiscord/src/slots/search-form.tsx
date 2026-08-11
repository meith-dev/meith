import type { OptionModel, SearchFormModel } from '@meith/theme-kit'

import { BTN_PRIMARY, CATEGORY_HEADING, PANEL } from '../shared'

const CONTROL =
  'w-full rounded-sm border border-input bg-surface px-3 py-2 text-sm text-foreground transition-colors focus-visible:border-ring'

function Choice({
  id,
  label,
  name,
  options,
}: {
  id: string
  label: string
  name: string
  options: readonly OptionModel[]
}) {
  const selected = options.find((option) => option.isSelected)

  return (
    <div>
      <label htmlFor={id} className={`${CATEGORY_HEADING} mb-1 block`}>
        {label}
      </label>
      <select id={id} name={name} defaultValue={selected?.value ?? ''} className={CONTROL}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function SearchForm({
  action,
  fields,
  query,
  maxQueryLength,
  forums,
  sorts,
  hint,
  errorMessage,
}: SearchFormModel) {
  const described = [
    hint === null ? null : 'search-hint',
    errorMessage === null ? null : 'search-error',
  ]
    .filter((id): id is string => id !== null)
    .join(' ')

  return (
    <section className={PANEL}>
      <form method="get" action={action} className="flex flex-col gap-4 px-4 py-4">
        <div>
          <label htmlFor="search-query" className={`${CATEGORY_HEADING} mb-1 block`}>
            Search for
          </label>
          <input
            id="search-query"
            type="search"
            name={fields.query}
            defaultValue={query}
            maxLength={maxQueryLength}
            autoComplete="off"
            placeholder="Words in a subject or a post"
            aria-invalid={errorMessage === null ? undefined : true}
            {...(described === '' ? {} : { 'aria-describedby': described })}
            className={CONTROL}
          />

          {hint !== null && (
            <p id="search-hint" className="mt-1.5 text-xs text-muted-foreground">
              {hint}
            </p>
          )}

          {errorMessage !== null && (
            <p id="search-error" className="mt-1.5 text-xs font-semibold text-destructive">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Choice id="search-forum" label="In" name={fields.forum} options={forums} />
          <Choice id="search-sort" label="Sort by" name={fields.sort} options={sorts} />
        </div>

        <div>
          <button type="submit" className={BTN_PRIMARY}>
            Search
          </button>
        </div>
      </form>
    </section>
  )
}
