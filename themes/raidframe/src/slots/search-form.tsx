import type { OptionModel, SearchFormModel } from '@meith/theme-kit'

import { BUTTON_PRIMARY, Frame, MICRO, PanelHead } from '../shared'

const CONTROL =
  'w-full border border-input bg-surface px-3 py-2 text-sm text-foreground focus-visible:border-ring'

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
      <label htmlFor={id} className={`${MICRO} mb-1 block`}>
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
    <Frame aria-labelledby="search-heading">
      <PanelHead id="search-heading" title="Search" />

      <form method="get" action={action} className="flex flex-col gap-4 px-4 py-4">
        <div>
          <label htmlFor="search-query" className={`${MICRO} mb-1 block`}>
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
            <p id="search-error" className={`${MICRO} mt-1.5 text-destructive`}>
              {errorMessage}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Choice id="search-forum" label="In" name={fields.forum} options={forums} />
          <Choice id="search-sort" label="Sort by" name={fields.sort} options={sorts} />
        </div>

        <div>
          <button type="submit" className={BUTTON_PRIMARY}>
            search
          </button>
        </div>
      </form>
    </Frame>
  )
}
