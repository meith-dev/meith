'use server'

import { redirect } from 'next/navigation'

import { generateToken, hashToken, verifyPassword } from '@meith/accounts'
import { ForbiddenError, ValidationError, logger, truncateIp } from '@meith/core'

import { ipAllowed } from '@meith/admin'

import {
  adminAllowlist,
  adminService,
  recordAdminAction,
  remoteAddress,
  resolveAdmin,
} from './admin'
import { getActor } from './context'
import { getContainer } from './container'
import { formStateReporter } from './form-state-reporter'
import { text } from './form-values'
import { isSafeLocalPath } from './safe-path'
import { twoFactorRequiredForStaff, twoFactorService } from './two-factor'
import { clearAdminCookie, readAdminToken, setAdminCookie } from './session-cookies'
import type { FormState } from './auth-form-state'

const toFormState = formStateReporter('admin-actions', 'unexpected error in an admin action')

export async function adminSignInAction(_prev: FormState, form: FormData): Promise<FormState> {
  let target: string

  try {
    if (!ipAllowed(await remoteAddress(), await adminAllowlist())) {
      throw new ForbiddenError('The control panel is not available from this address.')
    }

    const service = adminService()
    if (service === null) {
      throw new ForbiddenError(
        'This board is running on in-memory sample data, so it has no control panel.',
      )
    }

    const actor = await getActor()
    const { authorizer, accountStore } = getContainer()
    if (actor.userId === null || !authorizer.can(actor, 'admincp.access')) {
      throw new ForbiddenError('You cannot reach the control panel.')
    }

    const account = await accountStore.accounts.findById(actor.userId)
    if (account === null) throw new ForbiddenError('You cannot reach the control panel.')

    const password = text(form, 'password')
    if (password === '') throw new ValidationError('Enter your password.')

    const ok = await verifyPassword(password, account.passwordHash)
    if (!ok) {
      await recordAdminAction({ action: 'admin.signin_failed' })
      throw new ForbiddenError('That password is not right.')
    }

    await assertSecondFactorGiven({ userId: actor.userId, form })

    const existing = await resolveAdmin()
    if ('context' in existing) {
      await service.markReauthenticated(existing.context.session.id)
      await recordAdminAction({ action: 'admin.reauthenticated' })
    } else {
      const token = generateToken()
      const session = await service.start({
        userId: actor.userId,
        tokenHash: await hashToken(token),
        ipPrefix: truncateIp(await remoteAddress()) ?? null,
      })
      await setAdminCookie(token, session.expiresAt)
      await recordAdminAction({ action: 'admin.signed_in' })
    }

    target = safeAdminReturn(text(form, 'next'))
  } catch (err) {
    return toFormState(err)
  }

  redirect(target)
}

const ADMIN_NEEDS_TWO_FACTOR =
  'This board requires two-factor authentication of anyone who can reach the control ' +
  'panel. Set up an authenticator app on your account security page first.'

/**
 * The panel's door asks for the second factor as well as the password. The
 * panel can rewrite the whole board, so re-proving only the thing most likely
 * to have leaked would be re-proving the wrong one.
 */
async function assertSecondFactorGiven(input: {
  readonly userId: number
  readonly form: FormData
}): Promise<void> {
  const service = twoFactorService()
  if (service === null) return

  const enrolled = await service.isEnrolled(input.userId)

  if (!enrolled) {
    if (await twoFactorRequiredForStaff()) {
      throw new ForbiddenError(ADMIN_NEEDS_TWO_FACTOR)
    }
    return
  }

  const code = text(input.form, 'code')
  if (code === '') {
    throw new ValidationError('Enter the code from your authenticator app as well.')
  }

  const outcome = await service.verify({ userId: input.userId, code })
  if (outcome.status !== 'ok') {
    await recordAdminAction({ action: 'admin.signin_failed' })
    throw new ForbiddenError(
      outcome.status === 'replayed'
        ? 'That code has been used already. Wait for the next one.'
        : 'That code is not right.',
    )
  }
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
