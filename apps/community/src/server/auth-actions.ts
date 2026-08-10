'use server'

import { redirect } from 'next/navigation'

import {
  ConflictError,
  ForbiddenError,
  ValidationError,
  env,
  isAppError,
  logger,
} from '@meith/core'

import { DEFAULT_AUTH_POLICY, foldIdentifier, type LoginBucket } from '@meith/accounts'

import { remoteAddress } from './admin'
import { spendResendLimit, verifyChallenge } from './antispam'
import { sendPasswordResetEmail, sendVerificationEmail } from './auth-mail'
import { configuredIdentity, getContainer } from './container'
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

function field(form: FormData, name: string): string {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

function toFormState(err: unknown, values?: Record<string, string>): FormState {
  if (
    err instanceof ValidationError ||
    err instanceof ConflictError ||
    err instanceof ForbiddenError
  ) {
    return { error: err.message, values }
  }
  if (isAppError(err)) return { error: err.message, values }
  logger({ module: 'auth-actions' }).error({ err }, 'unexpected error in auth action')
  return { error: 'Something went wrong. Please try again.', values }
}

async function loginBuckets(identifier: string): Promise<readonly LoginBucket[]> {
  const account = foldIdentifier(identifier)
  const wide: LoginBucket = {
    key: `login:${account}`,
    max: DEFAULT_AUTH_POLICY.maxAccountLoginAttempts,
  }

  const address = await remoteAddress()
  if (address === null || address === '') return [wide]

  return [{ key: `login:${account}@${address}` }, wide]
}

export async function registerAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const username = field(form, 'username')
  const email = field(form, 'email')
  const password = field(form, 'password')
  const values = { username, email }

  const identity = await configuredIdentity()

  let verification: { token: string; email: string; username: string } | null = null

  try {
    const challenge = await verifyChallenge(form)
    if (!challenge.ok) return { error: challenge.reason, values }

    const fields = profileFieldService()
    const context = fields === null ? null : await registrationFieldContext()
    const fieldValues =
      fields === null || context === null
        ? []
        : await fields.validateRegistration({ submitted: submittedFields(form), context })

    const result = await identity.register({ username, email, password })

    if (fields !== null) await fields.applyRegistration(result.account.id, fieldValues)

    if (result.verificationToken !== undefined) {
      verification = {
        token: result.verificationToken,
        email: result.account.email,
        username: result.account.username,
      }
    }
  } catch (err) {
    return toFormState(err, values)
  }

  if (verification !== null) {
    try {
      await sendVerificationEmail(verification)
    } catch (err) {
      logger({ module: 'auth-actions' }).error(
        { err },
        'could not send a verification e-mail; the account exists and can ask for another',
      )
    }
    redirect(`/verify/resend?email=${encodeURIComponent(verification.email)}&sent=1`)
  }

  redirect('/login?registered=1')
}

export async function resendVerificationAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const email = field(form, 'email')
  const values = { email }

  const notice =
    'If that address has an account waiting to be confirmed, a new link has been sent.'

  try {
    const limit = await spendResendLimit(foldIdentifier(email))
    if (limit !== null && !limit.allowed) return { notice, values }

    const identity = await configuredIdentity()
    const resent = await identity.resendVerification(email)

    if (resent.token !== null && resent.account !== null) {
      try {
        await sendVerificationEmail({
          token: resent.token,
          email: resent.account.email,
          username: resent.account.username,
        })
      } catch (err) {
        logger({ module: 'auth-actions' }).error(
          { err },
          'could not resend a verification e-mail',
        )
      }
    }

    return { notice, values }
  } catch (err) {
    return toFormState(err, values)
  }
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
    const result = await identity.login(
      identifier,
      password,
      await loginBuckets(identifier),
    )
    await setSessionCookie(result.sessionToken, result.expiresAt)

    if (remember) {
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

  const notice =
    'If an account exists for that email, a password reset link has been sent.'

  try {
    const { token, userId } = await identity.requestPasswordReset(email)

    if (token !== null && userId !== null) {
      const account = await getContainer().accountStore.accounts.findById(userId)
      if (account !== null) {
        try {
          await sendPasswordResetEmail({
            token,
            email: account.email,
            username: account.username,
          })
        } catch (err) {
          logger({ module: 'auth-actions' }).error(
            { err },
            'could not send a password reset e-mail',
          )
        }
      }
    }

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

  const identity = await configuredIdentity()
  try {
    await identity.redeemPasswordReset(token, password)
  } catch (err) {
    return toFormState(err, { token })
  }

  redirect('/login?reset=1')
}

function sanitizeNext(next: string): string {
  if (next.startsWith('/') && !next.startsWith('//')) return next
  return '/'
}
