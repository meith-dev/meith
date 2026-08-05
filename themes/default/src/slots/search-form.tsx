import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  Field,
  Input,
  NativeSelect,
  buttonVariants,
} from '@meith/ui'
import type { OptionModel, SearchFormModel } from '@meith/theme-kit'

/**
 * The search form (F73), moved into the theme at the slot-contract freeze (F77).
 *
 * It lived in `app/(board)/search/page.tsx` until then, which made `SearchForm`
 * the one slot in the registry that no page rendered — a documented contract with
 * no implementation on either side of it. That is worse than an absent slot,
 * because it reads as available.
 *
 * `method="get"` is the feature, not the default. A search is a URL: linkable,
 * bookmarkable, cacheable, and reachable by pressing enter with no JavaScript
 * anywhere in the page. The names come from the model rather than being typed
 * here — the app owns the query-string contract, and a `name="q"` written into a
 * theme breaks every installed theme's form the day that parameter is renamed,
 * while the page carries on rendering.
 *
 * ## The error is attached to the field it is about
 *
 * "That search is too short" used to render as a notice above the form, which
 * left the control that caused it unmarked: a screen-reader user tabbing into
 * the box was told nothing, and the message was three elements away from the
 * thing to fix. `Field` wires `aria-describedby` and `aria-invalid` from the
 * same `error` prop, so the box announces its own problem.
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
    <Card>
      <CardContent className="p-4 sm:p-5">
        <form method="get" action={action} className="flex flex-col gap-4">
          <Field
            name={fields.query}
            label="Search for"
            error={errorMessage}
            {...(hint === null ? {} : { description: hint })}
          >
            {(control) => (
              <Input
                {...control}
                defaultValue={query}
                maxLength={maxQueryLength}
                /*
                 * `type="search"` rather than `text`: it gets the platform's
                 * clear affordance and, on iOS, a keyboard whose return key says
                 * "search". Neither is worth writing; both are worth having.
                 */
                type="search"
                autoComplete="off"
                placeholder="Words in a subject or a post"
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Choice label="In" name={fields.forum} options={forums} />
            <Choice label="Sort by" name={fields.sort} options={sorts} />
          </div>

          <div>
            <button type="submit" className={buttonVariants({ variant: 'primary' })}>
              Search
            </button>
          </div>
        </form>

        {/*
          A second copy of the message, for the reader who is not using the
          form's own announcement — a search that failed for a reason the field
          cannot express ("the index is rebuilding") still has to be readable.
          Rendered after the form so the field's own error is announced first.
        */}
        {errorMessage !== null && (
          <Alert tone="error" className="mt-4">
            <AlertDescription>
              <AlertTitle>No results.</AlertTitle> {errorMessage}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
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
