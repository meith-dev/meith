"use client"

/**
 * F59 — one custom profile field's input.
 *
 * Shared by the UserCP's profile form and the register form, because they ask
 * the same questions and must post the same names. A second copy would be one
 * copy that eventually renders a `select` as a text box, or forgets the `field:`
 * prefix, and the failure would be silent: the answer simply would not save.
 *
 * Every type renders as a native control that works with scripting off, and an
 * **unknown type falls back to a plain text input** rather than rendering
 * nothing — the field was defined by a deploy that knew a type this build does
 * not, and a member should still be able to answer it.
 */

/** One custom field, as a form renders it. */
export interface CustomFieldInput {
  readonly key: string
  readonly label: string
  readonly description: string | null
  /** `null` for a type this build does not know; rendered as a text input. */
  readonly type: string | null
  readonly options: readonly string[]
  readonly value: string
  readonly maxLength: number
  readonly required: boolean
}

/**
 * The input's name.
 *
 * Prefixed so a field keyed `website` cannot collide with the built-in input of
 * the same name. The server splits on the same prefix (`submittedFields`).
 */
export function fieldInputName(key: string): string {
  return `field:${key}`
}

export function CustomField({
  field,
  className,
}: {
  field: CustomFieldInput
  /** The host form's input styling; the two forms do not look alike. */
  className: string
}) {
  const name = fieldInputName(field.key)

  const control =
    field.type === "textarea" ? (
      <textarea
        name={name}
        defaultValue={field.value}
        className={className}
        rows={4}
        maxLength={field.maxLength}
        required={field.required}
      />
    ) : field.type === "select" ? (
      <select name={name} defaultValue={field.value} className={className} required={field.required}>
        {/* An empty option unless the field is required: "not answered" is a
            legitimate answer, and a dropdown with no way back to it is a trap. */}
        {field.required ? null : <option value="">—</option>}
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    ) : field.type === "checkbox" ? (
      <input
        type="checkbox"
        name={name}
        value="yes"
        defaultChecked={field.value !== ""}
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
        inputMode={field.type === "number" ? "numeric" : field.type === "url" ? "url" : undefined}
      />
    )

  return (
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
