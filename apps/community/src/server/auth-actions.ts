'use server'

import { redirect } from 'next/navigation'

import { env, logger, truncateIp } from '@meith/core'

import {
  REPLAYED_CODE,
  WRONG_CODE,
  foldIdentifier,
  type AuthConfig,
  type LoginBucket,
} from '@meith/accounts'

import { remoteAddress } from './admin'
import {
  limitMessage,
  loginAddressAttempts,
  refused,
  spendRegisterLimit,
  spendResendLimit,
  spendResetLimits,
  verifyChallenge,
} from './antispam'
import { recordAuthEvent } from './auth-events'
import { requestFingerprint } from './request-fingerprint'
import { twoFactorService } from './two-factor'
import { sendPasswordResetEmail, sendVerificationEmail } from './auth-mail'
import { boardAuthConfig } from './auth-config'
import { configuredIdentity, configuredSessions, getContainer } from './container'
import { formStateReporter } from './form-state-reporter'
import { termsAcceptance } from './legal'
import {
  profileFieldService,
  registrationFieldContext,
  submittedFields,
} from './profile-fields'
import { isSafeLocalPath } from './safe-path'
import type { FormState } from './auth-form-state'
import {
  clearSecondFactorCookie,
  clearSessionCookies,
  readSecondFactorToken,
  readSessionToken,
  setRememberCookie,
  setSecondFactorCookie,
  setSessionCookie,
} from './session-cookies'

function field(form: FormData, name: string): string {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

const toFormState = formStateReporter('auth-actions', 'unexpected error in auth action')

async function addressContext(): Promise<{ readonly ipPrefix: string | null }> {
  return { ipPrefix: truncateIp(await remoteAddress()) ?? null }
}

async function deviceContext(): Promise<{
  readonly ipPrefix: string | null
  readonly userAgent: string | null
}> {
  return requestFingerprint()
}

const SECOND_FACTOR_EXPIRED =
  'That sign-in took too long to finish. Start again from the sign-in page.'

async function loginBuckets(
  identifier: string,
  config: AuthConfig,
): Promise<readonly LoginBucket[]> {
  const account = foldIdentifier(identifier)
  const wide: LoginBucket = {
    key: `login:${account}`,
    max: config.maxAccountLoginAttempts,
  }

  const address = await remoteAddress()
  if (address === null || address === '') return [wide]

  const perAddress = await loginAddressAttempts()
  const prefix = truncateIp(address)
  if (perAddress <= 0 || prefix === undefined) {
    return [{ key: `login:${account}@${address}` }, wide]
  }

  return [
    { key: `login:${account}@${address}` },
    wide,
    { key: `login@${prefix}`, max: perAddress },
  ]
}

export async function registerAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const username = field(form, 'username')
  const email = field(form, 'email')
  const password = field(form, 'password')
  const accepted = field(form, 'terms') !== ''
  const values = { username, email, ...(accepted ? { terms: '1' } : {}) }

  const identity = await configuredIdentity()

  let verification: { token: string; email: string; username: string } | null = null

  try {
    const terms = await termsAcceptance()
    if (terms !== null && !accepted) {
      return {
        error: `Please read the ${terms.label.toLowerCase()} and tick the box to accept it.`,
        values,
      }
    }

    const challenge = await verifyChallenge(form)
    if (!challenge.ok) return { error: challenge.reason, values }

    const limited = await spendRegisterLimit()
    if (refused(limited)) return { error: limitMessage(limited), values }

    const fields = profileFieldService()
    const context = fields === null ? null : await registrationFieldContext()
    const fieldValues =
      fields === null || context === null
        ? []
        : await fields.validateRegistration({ submitted: submittedFields(form), context })

    const result = await identity.register(
      { username, email, password },
      await addressContext(),
    )

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

  let destination = next

  try {
    const config = await boardAuthConfig()
    const identity = await configuredIdentity()

    const outcome = await identity.login(
      identifier,
      password,
      await loginBuckets(identifier, config),
      await deviceContext(),
      { remember },
    )

    if (outcome.status === 'second-factor') {
      await setSecondFactorCookie(outcome.token, outcome.expiresAt)
      destination = verifyPath(next)
    } else {
      await completeSignIn(outcome.login, remember)
    }
  } catch (err) {
    await recordAuthEvent({ userId: null, kind: 'login_failed', detail: { identifier } })
    return toFormState(err, values)
  }

  redirect(destination)
}

async function completeSignIn(
  login: { account: { id: number }; sessionToken: string; expiresAt: Date },
  remember: boolean,
): Promise<void> {
  await setSessionCookie(login.sessionToken, login.expiresAt)

  if (remember) {
    const sessions = await configuredSessions()
    const remembered = await sessions.startRemembered(login.account.id, await deviceContext())
    await setRememberCookie(remembered.rememberToken, remembered.rememberExpiresAt)
  }

  await recordAuthEvent({ userId: login.account.id, kind: 'login' })
}

function verifyPath(next: string): string {
  return next === '/' ? '/login/verify' : `/login/verify?next=${encodeURIComponent(next)}`
}

export async function verifySecondFactorAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const code = field(form, 'code')
  const next = sanitizeNext(field(form, 'next'))

  const token = await readSecondFactorToken()
  if (token === undefined || token === '') {
    return { error: SECOND_FACTOR_EXPIRED }
  }

  const identity = await configuredIdentity()
  const pending = await identity.pendingSecondFactor(token)
  if (pending === null) {
    await clearSecondFactorCookie()
    return { error: SECOND_FACTOR_EXPIRED }
  }

  const service = twoFactorService()
  if (service === null) return { error: SECOND_FACTOR_EXPIRED }

  try {
    await identity.assertSecondFactorAttemptsLeft(pending.userId)

    const outcome = await service.verify({ userId: pending.userId, code })

    if (outcome.status !== 'ok') {
      await identity.recordSecondFactorFailure(pending.userId)
      await recordAuthEvent({ userId: pending.userId, kind: 'second_factor_failed' })
      return { error: outcome.status === 'replayed' ? REPLAYED_CODE : WRONG_CODE }
    }

    await identity.clearSecondFactorFailures(pending.userId)

    const login = await identity.redeemSecondFactor(token, await deviceContext())
    await clearSecondFactorCookie()
    await completeSignIn(login, pending.remember)

    if (outcome.usedRecoveryCode) {
      await recordAuthEvent({ userId: pending.userId, kind: 'recovery_code_used' })
    }
  } catch (err) {
    return toFormState(err)
  }

  redirect(next)
}

export async function abandonSecondFactorAction(): Promise<void> {
  const token = await readSecondFactorToken()

  if (token !== undefined && token !== '') {
    const identity = await configuredIdentity()
    const pending = await identity.pendingSecondFactor(token)
    if (pending !== null) await identity.abandonSecondFactor(pending.userId)
  }

  await clearSecondFactorCookie()
  redirect('/login')
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken()
  if (token) {
    const { identity } = getContainer()
    try {
      const resolved = await identity.resolveSession(token)
      await identity.logout(token)
      if (resolved !== null) {
        await recordAuthEvent({ userId: resolved.userId, kind: 'logout' })
      }
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
    const limits = await spendResetLimits(foldIdentifier(email))
    if (limits.some(refused)) return { notice }

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
    const { userId } = await identity.redeemPasswordReset(token, password)
    await recordAuthEvent({ userId, kind: 'password_reset' })
  } catch (err) {
    return toFormState(err, { token })
  }

  redirect('/login?reset=1')
}

function sanitizeNext(next: string): string {
  return isSafeLocalPath(next) ? next : '/'
}
