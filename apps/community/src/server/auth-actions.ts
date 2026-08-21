'use server'

import { redirect } from 'next/navigation'

import { type AuthConfig, foldIdentifier, hashToken, type LoginBucket } from '@meith/accounts'
import { env, logger } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'

import {
  limitMessage,
  loginAddressAttempts,
  refused,
  spendRegisterLimit,
  spendResendLimit,
  spendResetLimits,
  verifyChallenge,
} from './antispam'
import { boardAuthConfig } from './auth-config'
import { recordAuthEvent } from './auth-events'
import type { FormState } from './auth-form-state'
import { sendPasswordResetEmail, sendVerificationEmail } from './auth-mail'
import { configuredIdentity, configuredSessions, getContainer } from './container'
import { formStateReporter } from './form-state-reporter'
import { getTranslator, tr } from './i18n'
import { termsAcceptance } from './legal'
import { emitEvent, filterView } from './plugin-view'
import { profileFieldService, registrationFieldContext, submittedFields } from './profile-fields'
import {
  countingAddress,
  countingPrefix,
  requestFingerprint,
  retainedIpPrefix,
} from './request-fingerprint'
import { isSafeLocalPath } from './safe-path'
import {
  clearSecondFactorCookie,
  clearSessionCookies,
  readRememberToken,
  readSecondFactorToken,
  readSessionToken,
  setRememberCookie,
  setSecondFactorCookie,
  setSessionCookie,
} from './session-cookies'
import { twoFactorService } from './two-factor'

function field(form: FormData, name: string): string {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

const toFormState = formStateReporter('auth-actions', 'unexpected error in auth action')

async function addressContext(): Promise<{ readonly ipPrefix: string | null }> {
  return { ipPrefix: await retainedIpPrefix() }
}

async function deviceContext(): Promise<{
  readonly ipPrefix: string | null
  readonly userAgent: string | null
}> {
  return requestFingerprint()
}

async function loginBuckets(
  identifier: string,
  config: AuthConfig,
): Promise<readonly LoginBucket[]> {
  const account = foldIdentifier(identifier)
  const wide: LoginBucket = {
    key: `login:${account}`,
    max: config.maxAccountLoginAttempts,
  }

  const address = await countingAddress()
  if (address === null) return [wide]

  const perAddress = await loginAddressAttempts()
  const prefix = await countingPrefix()
  if (perAddress <= 0 || prefix === null) {
    return [{ key: `login:${account}@${address}` }, wide]
  }

  return [{ key: `login:${account}@${address}` }, wide, { key: `login@${prefix}`, max: perAddress }]
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
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
        error: await tr('authAction.acceptTerms', { terms: terms.label }),
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

    const objections = await filterView('user.register.validate', [], {
      username,
      email,
      ipPrefix: (await requestFingerprint()).ipPrefix,
    })
    if (objections.length > 0) return { error: objections[0]!, values }

    const result = await identity.register({ username, email, password }, await addressContext())

    await emitEvent(
      'user.registered',
      {
        userId: result.account.id,
        username: result.account.username,
        requiresActivation: result.verificationToken !== undefined,
      },
      { requestId: currentRequestId() ?? null },
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
      await sendVerificationEmail({ ...verification, t: await getTranslator() })
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

  const notice = await tr('authAction.verificationResent')

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
          t: await getTranslator(),
        })
      } catch (err) {
        logger({ module: 'auth-actions' }).error({ err }, 'could not resend a verification e-mail')
      }
    }

    return { notice, values }
  } catch (err) {
    return toFormState(err, values)
  }
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
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
    await recordAuthEvent({
      userId: await accountBehind(identifier),
      kind: 'login_failed',
      detail: { identifier },
    })
    await emitEvent(
      'user.login.attempted',
      {
        username: identifier,
        outcome: loginOutcomeOf(err),
        ipPrefix: (await requestFingerprint()).ipPrefix,
      },
      { requestId: currentRequestId() ?? null },
    )
    return toFormState(err, values)
  }

  await emitEvent(
    'user.login.attempted',
    {
      username: identifier,
      outcome: 'ok',
      ipPrefix: (await requestFingerprint()).ipPrefix,
    },
    { requestId: currentRequestId() ?? null },
  )

  redirect(destination)
}

async function accountBehind(identifier: string): Promise<number | null> {
  const lower = foldIdentifier(identifier)
  if (lower === '') return null

  try {
    const { accounts } = getContainer().accountStore
    const account =
      (await accounts.findByUsernameLower(lower)) ?? (await accounts.findByEmailLower(lower))

    return account?.id ?? null
  } catch (err) {
    logger({ module: 'auth-actions' }).warn({ err }, 'could not attribute a refused sign-in')
    return null
  }
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
  await emitEvent(
    'user.logged-in',
    { userId: login.account.id },
    { requestId: currentRequestId() ?? null },
  )
}

function loginOutcomeOf(error: unknown): 'bad-credentials' | 'locked-out' | 'banned' {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('banned') || message.includes('suspended')) return 'banned'
  if (message.includes('too many') || message.includes('locked')) return 'locked-out'
  return 'bad-credentials'
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
    return { error: await tr('authAction.secondFactorExpired') }
  }

  const identity = await configuredIdentity()
  const pending = await identity.pendingSecondFactor(token)
  if (pending === null) {
    await clearSecondFactorCookie()
    return { error: await tr('authAction.secondFactorExpired') }
  }

  const service = twoFactorService()
  if (service === null) return { error: await tr('authAction.secondFactorExpired') }

  try {
    await identity.assertSecondFactorAttemptsLeft(pending.userId)

    const outcome = await service.verify({ userId: pending.userId, code })

    if (outcome.status !== 'ok') {
      await identity.recordSecondFactorFailure(pending.userId)
      await recordAuthEvent({ userId: pending.userId, kind: 'second_factor_failed' })
      return {
        error: await tr(
          outcome.status === 'replayed' ? 'authAction.codeReplayed' : 'authAction.codeWrong',
        ),
      }
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
  const rememberToken = await readRememberToken()
  const { accountStore, identity } = getContainer()
  if (rememberToken) {
    try {
      const held = await accountStore.remember.findByTokenHash(await hashToken(rememberToken))
      if (held !== null) {
        await accountStore.remember.revokeFamily(held.familyId, 'logout', new Date())
      }
    } catch (err) {
      logger({ module: 'auth-actions' }).warn(
        { err },
        ['logout remember-token revoke failed', 'clearing cookies anyway'].join('; '),
      )
    }
  }
  if (token) {
    try {
      const resolved = await identity.resolveSession(token)
      await identity.logout(token)
      if (resolved !== null) {
        await recordAuthEvent({ userId: resolved.userId, kind: 'logout' })
        await emitEvent(
          'user.logged-out',
          { userId: resolved.userId, reason: 'requested' },
          { requestId: currentRequestId() ?? null },
        )
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

export async function requestResetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = field(form, 'email')
  const { identity } = getContainer()

  const notice = await tr('authAction.resetRequested')

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
            t: await getTranslator(),
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

export async function confirmResetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = field(form, 'token')
  const password = field(form, 'password')
  const confirm = field(form, 'confirm')

  if (password !== confirm) {
    return { error: await tr('notice.app.two-passwords-match'), values: { token } }
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
