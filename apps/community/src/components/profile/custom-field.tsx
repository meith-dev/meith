'use client'

export interface CustomFieldInput {
  readonly key: string
  readonly label: string
  readonly description: string | null
  readonly type: string | null
  readonly options: readonly string[]
  readonly value: string
  readonly maxLength: number
  readonly required: boolean
}

export function fieldInputName(key: string): string {
  return `field:${key}`
}

export function CustomField({ field, className }: { field: CustomFieldInput; className: string }) {
  const name = fieldInputName(field.key)

  const control =
    field.type === 'textarea' ? (
      <textarea
        name={name}
        defaultValue={field.value}
        className={className}
        rows={4}
        maxLength={field.maxLength}
        required={field.required}
      />
    ) : field.type === 'select' ? (
      <select
        name={name}
        defaultValue={field.value}
        className={className}
        required={field.required}
      >
        {field.required ? null : <option value="">—</option>}
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    ) : field.type === 'checkbox' ? (
      <input
        type="checkbox"
        name={name}
        value="yes"
        defaultChecked={field.value !== ''}
        className="size-4 rounded border-border"
        required={field.required}
      />
    ) : (
      <input
        type="text"
        name={name}
        defaultValue={field.value}
        className={className}
        maxLength={field.maxLength}
        required={field.required}
        inputMode={field.type === 'number' ? 'numeric' : field.type === 'url' ? 'url' : undefined}
      />
    )

  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is built above and inserted as {control}
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        {field.label}
        {field.required ? <span aria-hidden> *</span> : null}
      </span>
      {control}
      {field.description === null ? null : (
        <span className="text-xs text-muted-foreground">{field.description}</span>
      )}
    </label>
  )
}
