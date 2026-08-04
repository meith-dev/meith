/**
 * Form controls, and the wiring that makes a label a label.
 *
 * ## Why these are not Base UI's Field
 *
 * Base UI's `Field` is very good and it is a client component: it generates ids,
 * associates the description and the error with the control through
 * `aria-describedby`, and reflects validity as data attributes. Everything in
 * that list except the last is something a server can do once, at render, for
 * free — and the board's forms are native `method="post"` forms whose validation
 * comes back from the server anyway (R5: a form works with scripting off, so its
 * errors have to survive a round trip regardless).
 *
 * So `Field` here does the association from a single `name`, on the server, and
 * a form that wants live client-side validity uses Base UI's directly in an
 * island. The ids are derived rather than generated for a reason: `useId` output
 * differs between the server render and a client island that re-renders the same
 * form, and an `aria-describedby` pointing at an id that moved is worse than no
 * description at all.
 *
 * ## The controls are native, and that is not a compromise
 *
 * A `<select>` opens the platform picker — a wheel on iOS, a searchable list on
 * Android, a keyboard-navigable listbox on the desktop — and it does it with no
 * JavaScript at all. Nothing custom on this board would be better on any of
 * those, and three of them would be worse.
 */

import { cn } from './utils'

/* ------------------------------------------------------------------ *
 * Control surfaces
 * ------------------------------------------------------------------ */

/**
 * The shared box. `border-input` rather than `border-border` is the point: a
 * field's edge is essential information, so the token behind it is held to 3:1
 * against the surfaces it sits on, while a rule between two rows is not.
 */
const CONTROL = [
  'w-full rounded-md border border-input bg-card px-3 text-sm text-foreground',
  'transition-[border-color,box-shadow] duration-100',
  'placeholder:text-muted-foreground',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-invalid:border-destructive',
].join(' ')

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(CONTROL, 'h-9 py-1', className)}
      {...props}
    />
  )
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(CONTROL, 'min-h-32 resize-y py-2 leading-relaxed', className)}
      {...props}
    />
  )
}

/**
 * A native `<select>`.
 *
 * Named for what it is, so that reaching for a listbox island later is a
 * different import and therefore a decision. The platform arrow is left alone:
 * replacing it means drawing one, and a drawn arrow is a colour this file is not
 * allowed to name and a shape that stops matching the OS the moment it changes.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select data-slot="native-select" className={cn(CONTROL, 'h-9 pr-8', className)} {...props} />
  )
}

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn('text-sm font-medium leading-none text-foreground select-none', className)}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------ *
 * The wrapper that wires them together
 * ------------------------------------------------------------------ */

export interface FieldProps extends Omit<React.ComponentProps<'div'>, 'children' | 'id'> {
  /**
   * The control's `name`. Also the stem of every id in the group, which is why
   * it is required even when the caller renders the control itself.
   */
  readonly name: string
  /**
   * Overrides the derived id.
   *
   * Needed whenever one page carries two forms with a field of the same name —
   * an admin screen with a "create" form above an "edit" one, both with a
   * `title` — because the derived id would then appear twice in the document and
   * a `<label for>` resolves to whichever came first. Duplicate ids are not a
   * validation nicety: the wrong label gets announced, and clicking the second
   * label focuses the first field.
   */
  readonly id?: string
  readonly label: React.ReactNode
  /** Guidance shown under the control, and pointed at by `aria-describedby`. */
  readonly description?: React.ReactNode
  /** A server-side validation message. Announced, and marks the control invalid. */
  readonly error?: string | null
  /**
   * The control, given the ids it must carry. Called rather than cloned: a
   * `cloneElement` here would silently do nothing to a control the caller
   * wrapped in anything, which is the failure mode that makes a form look wired
   * up and be wired to nothing.
   */
  readonly children: (control: {
    id: string
    name: string
    'aria-describedby': string | undefined
    'aria-invalid': true | undefined
  }) => React.ReactNode
}

function Field({
  className,
  name,
  id: providedId,
  label,
  description,
  error,
  children,
  ...props
}: FieldProps) {
  const id = providedId ?? `field-${name}`
  const descriptionId = description === undefined ? null : `${id}-description`
  const errorId = error === null || error === undefined ? null : `${id}-error`

  /*
   * Error first: a screen reader reads `aria-describedby` in the order given,
   * and somebody who has just failed a submit needs the reason before the hint
   * they already read.
   */
  const describedBy = [errorId, descriptionId].filter((value) => value !== null).join(' ')

  return (
    <div data-slot="field" className={cn('flex flex-col gap-1.5', className)} {...props}>
      <Label htmlFor={id}>{label}</Label>

      {children({
        id,
        name,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-invalid': errorId === null ? undefined : true,
      })}

      {errorId !== null && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      {descriptionId !== null && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
}

export { Field, Input, Label, NativeSelect, Textarea }
