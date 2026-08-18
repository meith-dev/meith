import type { OptionModel, SearchAdvancedModel, SearchFormModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { PILL_PRIMARY } from '../shared'

const LABEL = 'mb-1 block text-sm font-semibold text-foreground'

const SELECT =
  'w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground transition-colors focus-visible:border-ring'

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
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} name={name} defaultValue={selected?.value ?? ''} className={SELECT}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Advanced({ label, isOpen, author, toggles, choices }: SearchAdvancedModel) {
  return (
    <details open={isOpen} className="rounded-lg border border-border bg-surface/60">
      <summary className="cursor-default px-3 py-2 text-sm font-semibold select-none">
        {label}
      </summary>

      <div className="flex flex-col gap-4 border-t border-border px-3 py-3">
        <div>
          <label htmlFor="search-author" className={LABEL}>
            {author.label}
          </label>
          <input
            id="search-author"
            type="text"
            name={author.field}
            defaultValue={author.value}
            placeholder={author.placeholder}
            autoComplete="off"
            aria-describedby="search-author-hint"
            className="w-full rounded-full border border-input bg-surface px-4 py-2.5 text-sm text-foreground transition-colors focus-visible:border-ring"
          />
          <p id="search-author-hint" className="mt-1.5 text-xs text-muted-foreground">
            {author.hint}
          </p>
        </div>

        {toggles.map((toggle) => (
          <label key={toggle.field} className="flex items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              name={toggle.field}
              value={toggle.value}
              defaultChecked={toggle.isOn}
              className="size-4 rounded border border-input accent-primary"
            />
            {toggle.label}
          </label>
        ))}

        <div className="grid gap-4 sm:grid-cols-3">
          {choices.map((choice) => (
            <Choice
              key={choice.field}
              id={`search-${choice.field}`}
              label={choice.label}
              name={choice.field}
              options={choice.options}
            />
          ))}
        </div>
      </div>
    </details>
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
  advanced,
  copy,
}: SearchFormModel & { copy: SlotCopy }) {
  const described = [
    hint === null ? null : 'search-hint',
    errorMessage === null ? null : 'search-error',
  ]
    .filter((id): id is string => id !== null)
    .join(' ')

  const c = (key: string) => fromSlotCopy(copy, `phasebook.searchForm.${key}`)

  return (
    <section className="rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
      <form method="get" action={action} className="flex flex-col gap-4 px-4 py-4">
        <div>
          <label htmlFor="search-query" className={LABEL}>
            {c('searchFor')}
          </label>
          <input
            id="search-query"
            type="search"
            name={fields.query}
            defaultValue={query}
            maxLength={maxQueryLength}
            autoComplete="off"
            placeholder={c('placeholder')}
            aria-invalid={errorMessage === null ? undefined : true}
            {...(described === '' ? {} : { 'aria-describedby': described })}
            className="w-full rounded-full border border-input bg-surface px-4 py-2.5 text-sm text-foreground transition-colors focus-visible:border-ring"
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
          <Choice id="search-forum" label={c('in')} name={fields.forum} options={forums} />
          <Choice id="search-sort" label={c('sortBy')} name={fields.sort} options={sorts} />
        </div>

        {advanced !== undefined && <Advanced {...advanced} />}

        <div>
          <button type="submit" className={PILL_PRIMARY}>
            {c('search')}
          </button>
        </div>
      </form>
    </section>
  )
}
