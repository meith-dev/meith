import { cn } from './utils'

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

function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select data-slot="native-select" className={cn(CONTROL, 'h-9 pr-8', className)} {...props} />
  )
}

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Label primitive itself — its caller supplies the control it wraps
    <label
      data-slot="label"
      className={cn('text-sm font-medium leading-none text-foreground select-none', className)}
      {...props}
    />
  )
}

export interface FieldProps extends Omit<React.ComponentProps<'div'>, 'children' | 'id'> {
  readonly name: string
  readonly id?: string
  readonly label: React.ReactNode
  readonly description?: React.ReactNode
  readonly error?: string | null
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
