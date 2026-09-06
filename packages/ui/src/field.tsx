import { cn } from './utils'
import { controlVariants } from './variants'

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(controlVariants(), 'py-2', className)}
      {...props}
    />
  )
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlVariants(), 'h-auto min-h-36 resize-y py-3 leading-relaxed', className)}
      {...props}
    />
  )
}

function NativeSelect({
  className,
  controlSize = 'default',
  ...props
}: React.ComponentProps<'select'> & { controlSize?: 'sm' | 'default' }) {
  return (
    <select
      data-slot="native-select"
      className={cn(controlVariants({ size: controlSize }), 'pr-8', className)}
      {...props}
    />
  )
}

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Label primitive itself — its caller supplies the control it wraps
    <label
      data-slot="label"
      className={cn('text-sm font-medium leading-5 text-foreground select-none', className)}
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
    <div data-slot="field" className={cn('flex min-w-0 flex-col gap-2', className)} {...props}>
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
        <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
}

export { Field, Input, Label, NativeSelect, Textarea }
