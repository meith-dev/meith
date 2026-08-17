'use client'

import { useFormStatus } from 'react-dom'

import { Alert, AlertDescription, AlertTitle, Input, Field as UiField } from '@meith/ui'
import { Button } from '@meith/ui/button'

import { useCopy } from '../shell/copy'

export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { pending } = useFormStatus()
  const c = useCopy()

  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      disabled={pending}
      className={className ?? 'w-full'}
    >
      {pending ? c('form.working') : children}
    </Button>
  )
}

export function FormError({ message }: { message?: string | undefined }) {
  const c = useCopy()
  if (!message) return null
  return (
    <Alert tone="error">
      <AlertDescription>
        <AlertTitle>{c('form.notSaved')}</AlertTitle> {message}
      </AlertDescription>
    </Alert>
  )
}

export function FormNotice({ message }: { message?: string | undefined }) {
  if (!message) return null
  return (
    <Alert tone="success">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

interface FieldProps {
  label: string
  name: string
  type?: string | undefined
  autoComplete?: string | undefined
  required?: boolean | undefined
  defaultValue?: string | undefined
  minLength?: number | undefined
  maxLength?: number | undefined
  hint?: string | undefined
  error?: string | undefined
  id?: string | undefined
}

export function Field({
  label,
  name,
  type = 'text',
  autoComplete,
  required = true,
  defaultValue,
  minLength,
  maxLength,
  hint,
  error,
  id,
}: FieldProps) {
  return (
    <UiField
      name={name}
      label={label}
      error={error ?? null}
      {...(id === undefined ? {} : { id })}
      {...(hint === undefined ? {} : { description: hint })}
    >
      {(control) => (
        <Input
          {...control}
          type={type}
          required={required}
          {...(autoComplete === undefined ? {} : { autoComplete })}
          {...(defaultValue === undefined ? {} : { defaultValue })}
          {...(minLength === undefined ? {} : { minLength })}
          {...(maxLength === undefined ? {} : { maxLength })}
        />
      )}
    </UiField>
  )
}
