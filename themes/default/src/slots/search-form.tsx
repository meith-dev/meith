import type { OptionModel, SearchAdvancedModel, SearchFormModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  buttonVariants,
  Card,
  CardContent,
  Disclosure,
  Field,
  Input,
  NativeSelect,
} from '@meith/ui'

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
  const c = (key: string) => fromSlotCopy(copy, `default.searchForm.${key}`)

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <form method="get" action={action} className="flex flex-col gap-4">
          <Field
            name={fields.query}
            label={c('searchFor')}
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
                placeholder={c('placeholder')}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Choice label={c('in')} name={fields.forum} options={forums} />
            <Choice label={c('sortBy')} name={fields.sort} options={sorts} />
          </div>

          {advanced !== undefined && <Advanced {...advanced} />}

          <div>
            <button type="submit" className={buttonVariants({ variant: 'primary' })}>
              {c('search')}
            </button>
          </div>
        </form>

        {errorMessage !== null && (
          <Alert tone="error" className="mt-4">
            <AlertDescription>
              <AlertTitle>{c('noResults')}</AlertTitle> {errorMessage}
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
