/**
 * The serialisable state every auth action returns to `useActionState`.
 *
 * Kept in its own plain module (NOT the `'use server'` action file, which may
 * only export async functions, and NOT a `server-only` one, since client form
 * components import `EMPTY_STATE` as their initial state).
 */
// The `| undefined` on each optional is required under exactOptionalPropertyTypes
// (set in the app's build tsconfig): actions build these objects conditionally,
// so `values` etc. really can be `undefined` at the value level.
export interface FormState {
  /** A top-of-form error message, shown in an alert. */
  readonly error?: string | undefined
  /** A non-error confirmation (e.g. "check your email"). */
  readonly notice?: string | undefined
  /** Echoed back so a no-JS re-render keeps what the user typed (never the password). */
  readonly values?: Record<string, string> | undefined
  /**
   * A rendered preview of the submitted body (F36/F41).
   *
   * Trusted HTML, and only ever `@forum/bbcode`'s own output — which is why it
   * is a distinct field rather than an entry in `values`: everything in
   * `values` is echoed back into a form control as text, and one field that is
   * inserted as markup instead must not be reachable by the same name.
   */
  readonly preview?: string | undefined
}

export const EMPTY_STATE: FormState = {}
