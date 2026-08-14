import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  Disclosure,
  Field,
  Input,
  NativeSelect,
  buttonVariants,
} from '@meith/ui'
import type { OptionModel, SearchAdvancedModel, SearchFormModel } from '@meith/theme-kit'

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

          {advanced !== undefined && <Advanced {...advanced} />}

          <div>
            <button type="submit" className={buttonVariants({ variant: 'primary' })}>
              Search
            </button>
          </div>
        </form>

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

function Advanced({ label, isOpen, author, toggles, choices }: SearchAdvancedModel) {
  return (
    <Disclosure summary={label} open={isOpen}>
      <div className="flex flex-col gap-4">
        <Field name={author.field} label={author.label} description={author.hint}>
          {(control) => (
            <Input
              {...control}
              defaultValue={author.value}
              placeholder={author.placeholder}
              autoComplete="off"
            />
          )}
        </Field>

        {toggles.map((toggle) => (
          <label
            key={toggle.field}
            className="flex items-center gap-2 text-sm text-foreground select-none"
          >
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
              label={choice.label}
              name={choice.field}
              options={choice.options}
            />
          ))}
        </div>
      </div>
    </Disclosure>
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
