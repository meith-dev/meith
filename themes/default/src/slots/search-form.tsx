import type { OptionModel, SearchFormModel } from '@meith/theme-kit'

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * The search form (F73), moved into the theme at the v1 freeze (F77).
 *
 * It lived in `app/(board)/search/page.tsx` until now, which made `SearchForm`
 * the one slot in the registry that no page rendered — a documented contract with
 * no implementation on either side of it. That is worse than an absent slot,
 * because it reads as available.
 *
 * `method="get"` is the feature, not the default. A search is a URL: linkable,
 * bookmarkable, cacheable, and reachable by pressing enter with no JavaScript
 * anywhere in the page. The names come from the model rather than being typed
 * here — the app owns the query-string contract.
 */
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
  return (
    <div className="flex flex-col gap-4">
      {hint !== null && <p className="text-sm text-muted-foreground">{hint}</p>}

      {errorMessage !== null && (
        <p role="alert" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {errorMessage}
        </p>
      )}

      <form
        method="get"
        action={action}
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Search for</span>
          <input
            name={fields.query}
            defaultValue={query}
            maxLength={maxQueryLength}
            className={INPUT}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Choice label="In" name={fields.forum} options={forums} />
          <Choice label="Sort by" name={fields.sort} options={sorts} />
        </div>

        <div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Search
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * `defaultValue` on the `<select>`, not `selected` on the `<option>`: React warns
 * about the latter and, more to the point, a form that is re-rendered after a
 * failed search must come back with the viewer's filters still chosen.
 */
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
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select name={name} defaultValue={selected?.value ?? ''} className={INPUT}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
