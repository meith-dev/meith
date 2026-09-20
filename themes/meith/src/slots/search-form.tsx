import type { OptionModel, SearchAdvancedModel, SearchFormModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Disclosure, Field, Input, NativeSelect } from '@meith/ui'

import { EDITORIAL_RULE, LABEL, PRIMARY_ACTION } from '../shared'

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
  const c = (key: string) => fromSlotCopy(copy, `meith.searchForm.${key}`)

  return (
    <div className={`${EDITORIAL_RULE} pt-5`}>
      <form method="get" action={action} className="flex flex-col gap-5">
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

        <div className="grid gap-5 sm:grid-cols-2">
          <Choice label={c('in')} name={fields.forum} options={forums} />
          <Choice label={c('sortBy')} name={fields.sort} options={sorts} />
        </div>

        {advanced !== undefined && <Advanced {...advanced} />}

        <div>
          <button type="submit" className={PRIMARY_ACTION}>
            {c('search')}
            <span
              aria-hidden="true"
              className="inline-block text-[1.2em] leading-none transition-transform duration-[160ms] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
            >
              ↗
            </span>
          </button>
        </div>
      </form>

      {errorMessage !== null && (
        <p
          role="alert"
          className="mt-5 border border-border border-l-4 border-l-foreground px-4 py-3 text-[0.9375rem] leading-relaxed text-foreground"
        >
          <span className={`${LABEL} me-3`}>{c('noResults')}</span>
          {errorMessage}
        </p>
      )}
    </div>
  )
}

function Advanced({ label, isOpen, author, toggles, choices }: SearchAdvancedModel) {
  return (
    <Disclosure summary={label} open={isOpen}>
      <div className="flex flex-col gap-5">
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
            className="flex items-center gap-2.5 text-[0.875rem] text-foreground select-none"
          >
            <input
              type="checkbox"
              name={toggle.field}
              value={toggle.value}
              defaultChecked={toggle.isOn}
              className="size-4 border border-input accent-primary"
            />
            {toggle.label}
          </label>
        ))}

        <div className="grid gap-5 sm:grid-cols-3">
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
