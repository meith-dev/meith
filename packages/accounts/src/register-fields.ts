import { isAppError } from '@meith/core'

export const REGISTER_FIELD = {
  username: 'username',
  email: 'email',
  password: 'password',
} as const

export type RegisterField = (typeof REGISTER_FIELD)[keyof typeof REGISTER_FIELD]

const FIELDS: readonly string[] = Object.values(REGISTER_FIELD)

export function rejectedField(error: unknown): RegisterField | null {
  if (!isAppError(error)) return null
  const field = error.meta.field
  return typeof field === 'string' && FIELDS.includes(field)
    ? (field as RegisterField)
    : null
}
