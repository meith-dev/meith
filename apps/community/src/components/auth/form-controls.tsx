'use client'

import { useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'

import { Alert, AlertDescription, AlertTitle, Input, Field as UiField } from '@meith/ui'
import { Button } from '@meith/ui/button'

import { fromCopy, useCopy } from '../shell/copy'

export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { pending } = useFormStatus()
  const copy = useCopy()

  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      disabled={pending}
      className={className ?? 'w-full'}
    >
      {pending ? fromCopy(copy, 'form.working') : children}
    </Button>
  )
}

export function useFocusOnFail<T extends HTMLElement>(failed: boolean) {
  const { pending } = useFormStatus()
  const ref = useRef<T>(null)
  const wasPending = useRef(pending)

  useEffect(() => {
    if (wasPending.current && !pending && failed) ref.current?.focus()
    wasPending.current = pending
  }, [pending, failed])

  return ref
}

export function FormError({ message }: { message?: string | undefined }) {
  const copy = useCopy()
  const ref = useFocusOnFail<HTMLDivElement>(message !== undefined && message !== '')
  if (!message) return null
  return (
    <Alert tone="error" ref={ref} tabIndex={-1}>
      <AlertDescription>
        <AlertTitle>{fromCopy(copy, 'form.notSaved')}</AlertTitle> {message}
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
