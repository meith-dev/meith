'use server'

/**
 * F18/F19 Server Actions: register, login, logout, request-reset, confirm-reset.
 *
 * Every action is written for `useActionState` AND for a no-JS form post: each
 * returns a plain serialisable `FormState` (never throws to the client), reads
 * from `FormData` (so a native submit works with scripting disabled), and does
 * its own `redirect()` on success. Progressive enhancement is a hard F18
 * requirement — the whole auth flow must work with JavaScript turned off — so
 * there is no client-side validation these depend on.
 *
 * Domain errors (`ValidationError`, `ConflictError`, `ForbiddenError`) are the
 * expected failure channel and are caught and turned into a field/summary
 * message; anything else rethrows as a real 500.
 */
import { redirect } from 'next/navigation'

import {
  ConflictError,
  ForbiddenError,
  ValidationError,
  env,
  isAppError,
  logger,
} from '@meith/core'

import { foldIdentifier } from '@meith/accounts'

import { getContainer } from './container'
import {
  profileFieldService,
  registrationFieldContext,
  submittedFields,
} from './profile-fields'
import type { FormState } from './auth-form-state'
import {
  clearSessionCookies,
  readSessionToken,
  setRememberCookie,
  setSessionCookie,
} from './session-cookies'

/** Pull a trimmed string field; '' when absent. */
function field(form: FormData, name: string): string {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

/** Turn a thrown domain error into a FormState; rethrow the unexpected. */
function toFormState(err: unknown, values?: Record<string, string>): FormState {
  if (
    err instanceof ValidationError ||
    err instanceof ConflictError ||
    err instanceof ForbiddenError
  ) {
    return { error: err.message, values }
  }
  // Not an expected domain failure: log it and surface a generic message rather
  // than leaking internals. Rethrowing would blank the form with a 500 page;
  // for a bad-gateway-class fault that is worse UX than an inline message.
  if (isAppError(err)) return { error: err.message, values }
  logger({ module: 'auth-actions' }).error({ err }, 'unexpected error in auth action')
  return { error: 'Something went wrong. Please try again.', values }
}

/**
 * A coarse per-request lockout bucket. The username is the primary key (so
 * guessing account A cannot lock account B); we deliberately do NOT mix in IP
 * here in fixture mode because the demo has no proxy header to trust. The
 * Postgres path can compose a richer bucket later without touching this action.
 */
function loginBucket(identifier: string): string {
  // Same folding the account lookup uses, and for the same reason: a
  // locale-dependent fold would let an attacker alternate case to get two
  // independent lockout buckets for one account. See `foldIdentifier`.
  return `login:${foldIdentifier(identifier)}`
}

export async function registerAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const username = field(form, 'username')
  const email = field(form, 'email')
  const password = field(form, 'password')
  const values = { username, email }

  const { identity } = getContainer()
  try {
    /*
     * F59's required fields are validated *before* the account exists, and
     * written after. Doing it the other way round would leave a member the
     * board considers incomplete: registered, logged in, and missing an answer
     * the operator made mandatory, with no screen that insists on it.
     *
     * A failure here therefore costs nothing — the form comes back with the
     * message and no account was created.
     */
    const fields = profileFieldService()
    const context = fields === null ? null : await registrationFieldContext()
    const fieldValues =
      fields === null || context === null
        ? []
        : await fields.validateRegistration({ submitted: submittedFields(form), context })

    const result = await identity.register({ username, email, password })

    /*
     * Not in the registration transaction, because there is not one to join —
     * `register` owns its own. A field write that fails here leaves a usable
     * account with an unanswered required field, which is recoverable from the
     * UserCP; the reverse (an answer with no account) is not recoverable by
     * anybody.
     */
    if (fields !== null) await fields.applyRegistration(result.account.id, fieldValues)
  } catch (err) {
    return toFormState(err, values)
  }

  // activationMethod is 'none' in the current config, so the account is usable
  // immediately — send them to login with a success hint rather than auto-
  // authenticating, which keeps register and login as separate credentials tests.
  redirect('/login?registered=1')
}

export async function loginAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const identifier = field(form, 'identifier')
  const password = field(form, 'password')
  const remember = form.get('remember') === 'on'
  const next = sanitizeNext(field(form, 'next'))
  const values = { identifier }

  const { identity, sessions } = getContainer()

  try {
    const result = await identity.login(identifier, password, loginBucket(identifier))
    await setSessionCookie(result.sessionToken, result.expiresAt)

    if (remember) {
      // A brand-new remember-me family. This also mints its own short session,
      // but we already set one from login(); the remember family is what
      // survives the session's idle expiry, so we only need its token here.
      const remembered = await sessions.startRemembered(result.account.id)
      await setRememberCookie(remembered.rememberToken, remembered.rememberExpiresAt)
    }
  } catch (err) {
    return toFormState(err, values)
  }

  redirect(next)
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken()
  if (token) {
    const { identity } = getContainer()
    // Best-effort server-side revoke; even if it fails we still clear cookies so
    // the browser stops presenting the token.
    try {
      await identity.logout(token)
    } catch (err) {
      logger({ module: 'auth-actions' }).warn(
        { err },
        'logout revoke failed; clearing cookies anyway',
      )
    }
  }
  await clearSessionCookies()
  redirect('/login')
}

export async function requestResetAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const email = field(form, 'email')
  const { identity } = getContainer()

  // Identical whether or not an account matched — that is the enumeration
  // defence, so it is built once and returned on every path below.
  const notice =
    'If an account exists for that email, a password reset link has been sent.'

  try {
    const { token } = await identity.requestPasswordReset(email)

    /*
     * The token is a bearer credential: whoever holds it owns the account. It
     * goes to the browser ONLY in development, where there is no mailer and the
     * alternative is a flow nobody can exercise.
     *
     * Gated on NODE_ENV rather than on the mail driver or the data source: a
     * production board with mail misconfigured must still never hand a reset
     * token to whoever typed the address into the form. Anything short of this
     * is unauthenticated account takeover for any address an attacker knows.
     *
     * It is deliberately not logged either — pino's redaction covers `token`
     * keys, but a token interpolated into a URL string sails straight through,
     * and F02/§40 forbids credentials in logs at default level.
     */
    if (token && env.NODE_ENV === 'development') {
      return { notice, values: { devToken: token } }
    }
    return { notice }
  } catch (err) {
    return toFormState(err, { email })
  }
}

export async function confirmResetAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const token = field(form, 'token')
  const password = field(form, 'password')
  const confirm = field(form, 'confirm')

  if (password !== confirm) {
    return { error: 'The two passwords do not match.', values: { token } }
  }

  const { identity } = getContainer()
  try {
    await identity.redeemPasswordReset(token, password)
  } catch (err) {
    return toFormState(err, { token })
  }

  redirect('/login?reset=1')
}

/**
 * Only allow same-origin relative redirects after login. An attacker-supplied
 * `?next=https://evil.example` would otherwise turn the login form into an open
 * redirect; anything not starting with a single '/' is dropped to the home page.
 */
function sanitizeNext(next: string): string {
  if (next.startsWith('/') && !next.startsWith('//')) return next
  return '/'
}
