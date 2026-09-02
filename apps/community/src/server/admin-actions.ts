'use server'

import { redirect } from 'next/navigation'

import { generateToken, hashToken, verifyPassword } from '@meith/accounts'
import { type AdminService, ipAllowed } from '@meith/admin'
import { ForbiddenError, logger, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import {
  abandonAdminSecondFactor,
  adminAllowlist,
  adminService,
  holdAdminSecondFactor,
  pendingAdminSecondFactor,
  recordAdminAction,
  redeemAdminSecondFactor,
  resolveAdmin,
} from './admin'
import { boardAuthConfig } from './auth-config'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { text } from './form-values'
import { remoteAddress, retainedIpPrefix } from './request-fingerprint'
import { isSafeLocalPath } from './safe-path'
import { clearAdminCookie, readAdminToken, setAdminCookie } from './session-cookies'
import { twoFactorRequiredForStaff, twoFactorService } from './two-factor'

const toFormState = formStateReporter('admin-actions', 'unexpected error in an admin action')

export async function adminSignInAction(_prev: FormState, form: FormData): Promise<FormState> {
  let target: string

  try {
    if (!ipAllowed(await remoteAddress(), await adminAllowlist())) {
      throw new ForbiddenError(msg('error.app.control-panel-available-from-address'))
    }

    const service = adminService()
    if (service === null) {
      throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-25'))
    }

    const actor = await getActor()
    const { authorizer, accountStore } = getContainer()
    if (actor.userId === null || !authorizer.can(actor, 'admincp.access')) {
      throw new ForbiddenError(msg('error.app.reach-control-panel'))
    }

    const account = await accountStore.accounts.findById(actor.userId)
    if (account === null) throw new ForbiddenError(msg('error.app.reach-control-panel'))

    const config = await boardAuthConfig()
    const attemptBucket = await adminReauthenticationBucket(actor.userId)
    const attemptSince = new Date(Date.now() - config.lockoutMinutes * 60_000)
    if (
      config.maxLoginAttempts > 0 &&
      (await accountStore.loginAttempts.countFailuresSince(attemptBucket, attemptSince)) >=
        config.maxLoginAttempts
    ) {
      throw new ForbiddenError(msg('error.accounts.too-many-failed-attempts-please'))
    }

    const failAttempt = async (): Promise<void> => {
      await accountStore.loginAttempts.record(attemptBucket, false, new Date())
      await recordAdminAction({ action: 'admin.signin_failed' })
    }

    const password = text(form, 'password')
    if (password === '') {
      await failAttempt()
      throw new ValidationError(msg('error.app.enter-password'))
    }

    const ok = await verifyPassword(password, account.passwordHash)
    if (!ok) {
      await failAttempt()
      throw new ForbiddenError(msg('error.app.password-right'))
    }

    const next = safeAdminReturn(text(form, 'next'))
    const twoFactor = twoFactorService()

    if (twoFactor !== null && (await twoFactor.isEnrolled(actor.userId))) {
      await holdAdminSecondFactor(actor.userId, next)
      target = '/admin'
    } else {
      if (twoFactor !== null && (await twoFactorRequiredForStaff())) {
        await failAttempt()
        throw new ForbiddenError(msg('adminAction.twoFactorRequired'))
      }

      await accountStore.loginAttempts.clear(attemptBucket)
      target = await startAdminSession(service, actor.userId, next)
    }
  } catch (err) {
    return toFormState(err)
  }

  redirect(target)
}

export async function adminVerifySecondFactorAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  let target: string

  try {
    if (!ipAllowed(await remoteAddress(), await adminAllowlist())) {
      throw new ForbiddenError(msg('error.app.control-panel-available-from-address'))
    }

    const service = adminService()
    if (service === null) {
      throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-25'))
    }

    const actor = await getActor()
    const { authorizer, accountStore } = getContainer()
    if (actor.userId === null || !authorizer.can(actor, 'admincp.access')) {
      throw new ForbiddenError(msg('error.app.reach-control-panel'))
    }

    const twoFactor = twoFactorService()
    const pending = await pendingAdminSecondFactor()
    if (twoFactor === null || pending === null) {
      throw new ForbiddenError(msg('adminAction.twoFactorExpired'))
    }

    const config = await boardAuthConfig()
    const attemptBucket = await adminReauthenticationBucket(actor.userId)
    const attemptSince = new Date(Date.now() - config.lockoutMinutes * 60_000)
    if (
      config.maxLoginAttempts > 0 &&
      (await accountStore.loginAttempts.countFailuresSince(attemptBucket, attemptSince)) >=
        config.maxLoginAttempts
    ) {
      throw new ForbiddenError(msg('error.accounts.too-many-failed-attempts-please'))
    }

    const failAttempt = async (): Promise<void> => {
      await accountStore.loginAttempts.record(attemptBucket, false, new Date())
      await recordAdminAction({ action: 'admin.signin_failed' })
    }

    const code = text(form, 'code')
    if (code === '') {
      await failAttempt()
      throw new ValidationError(msg('error.app.enter-code-from-authenticator-app'))
    }

    const outcome = await twoFactor.verify({ userId: pending.userId, code })
    if (outcome.status !== 'ok') {
      await failAttempt()
      throw new ForbiddenError(
        msg(outcome.status === 'replayed' ? 'adminAction.codeReplayed' : 'adminAction.codeWrong'),
      )
    }

    const redeemed = await redeemAdminSecondFactor()
    if (redeemed === null) {
      throw new ForbiddenError(msg('adminAction.twoFactorExpired'))
    }

    await accountStore.loginAttempts.clear(attemptBucket)
    target = await startAdminSession(service, pending.userId, safeAdminReturn(redeemed.next))
  } catch (err) {
    return toFormState(err)
  }

  redirect(target)
}

export async function adminAbandonSecondFactorAction(): Promise<void> {
  await abandonAdminSecondFactor()
  redirect('/admin')
}

async function startAdminSession(
  service: AdminService,
  userId: number,
  target: string,
): Promise<string> {
  const existing = await resolveAdmin()
  if ('context' in existing) {
    await service.markReauthenticated(existing.context.session.id)
    await recordAdminAction({ action: 'admin.reauthenticated' })
  } else {
    const token = generateToken()
    const session = await service.start({
      userId,
      tokenHash: await hashToken(token),
      ipPrefix: await retainedIpPrefix(),
    })
    await setAdminCookie(token, session.expiresAt)
    await recordAdminAction({ action: 'admin.signed_in' })
  }

  return target
}

async function adminReauthenticationBucket(userId: number): Promise<string> {
  const prefix = await retainedIpPrefix()
  return prefix === null ? `admin-reauth:${userId}` : `admin-reauth:${userId}@${prefix}`
}

export async function adminSignOutAction(): Promise<void> {
  try {
    const token = await readAdminToken()
    const service = adminService()

    if (token !== null && token !== '' && service !== null) {
      const resolved = await resolveAdmin()
      if ('context' in resolved) {
        await recordAdminAction({ action: 'admin.signed_out' })
        await service.end(resolved.context.session.id)
      }
    }
  } catch (err) {
    logger({ module: 'admin-actions' }).warn({ err }, 'admin sign-out could not revoke')
  }

  await clearAdminCookie()
  redirect('/')
}

function safeAdminReturn(raw: string): string {
  const trimmed = raw.trim()
  if (!isSafeLocalPath(trimmed) || !trimmed.startsWith('/admin')) return '/admin'
  if (/^\/admin[^/?#]/.test(trimmed)) return '/admin'
  return trimmed
}
