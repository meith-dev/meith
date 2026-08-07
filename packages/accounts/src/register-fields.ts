/**
 * Which answer a registration refusal is *about*.
 *
 * `register()` rejects three separate things — the name, the address and the
 * password — and until this existed it said so only in prose. A caller with a
 * form had one message and no idea which box to attach it to, so every refusal
 * became a banner: correct, and one screen away from the input that caused it.
 *
 * That is survivable on `/register`, where there are three boxes and the
 * sentence names one of them. It is not survivable in the **installer**, where
 * the refusal arrives wrapped in a step report and reads as *"the 'admin' step
 * failed"* — a system fault, on a form whose administrator-name box the operator
 * had just typed `admin` into.
 *
 * So the errors carry the field in `meta`, and `rejectedField()` reads it back.
 * `meta` rather than `ValidationError.fieldErrors` because two of the five
 * refusals are `ConflictError` — a taken name is not a malformed one — and a
 * caller should not have to know which class it caught to find out which box to
 * point at.
 */
import { isAppError } from '@meith/core'

/**
 * The three answers `register()` can refuse.
 *
 * The names match `RegisterInput`'s properties, which is what makes them usable
 * as form field names by every caller that posts a form shaped like it — the
 * board's own `/register`, and the installer.
 */
export const REGISTER_FIELD = {
  username: 'username',
  email: 'email',
  password: 'password',
} as const

export type RegisterField = (typeof REGISTER_FIELD)[keyof typeof REGISTER_FIELD]

const FIELDS: readonly string[] = Object.values(REGISTER_FIELD)

/**
 * The field a thrown refusal is about, or `null`.
 *
 * `null` for anything that is not one of `register()`'s own refusals — a
 * database that went away mid-insert is not a problem with the name somebody
 * typed, and offering to fix it beside a box would be a lie. Callers keep their
 * existing "something went wrong" path for that case.
 */
export function rejectedField(error: unknown): RegisterField | null {
  if (!isAppError(error)) return null
  const field = error.meta.field
  return typeof field === 'string' && FIELDS.includes(field)
    ? (field as RegisterField)
    : null
}
