import type { ConfirmField, FormState } from './auth-form-state'

const CONFIRMED = 'confirmed'

export function isConfirmed(form: FormData): boolean {
  return form.get(CONFIRMED) === '1'
}

export function requireConfirmation(form: FormData, message: string): FormState | null {
  if (isConfirmed(form)) return null

  const fields: ConfirmField[] = []
  form.forEach((value, name) => {
    if (name === CONFIRMED) return
    if (typeof value === 'string') fields.push({ name, value })
  })

  return { confirm: { message, fields } }
}
