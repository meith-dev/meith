'use server'

/**
 * F63 — signing in and out of the control panel.
 *
 * Three verbs, and one rule shapes all of them: **entering the ACP proves the
 * password again.** The board session says who you are; it does not say that
 * you are still at the keyboard, and an unattended browser is the threat this
 * whole feature exists for.
 *
 * The same verb serves the initial sign-in and the mid-session re-authentication
 * a destructive operation asks for. They are the same act — prove the password,
 * move the proof clock — and writing them twice would be two chances to move
 * the wrong clock.
 */
import { redirect } from 'next/navigation'

import { generateToken, hashToken, verifyPassword } from '@forum/accounts'
import { ForbiddenError, ValidationError, isAppError, logger, truncateIp } from '@forum/core'

import { ipAllowed } from '@forum/admin'

import {
  adminAllowlist,
  adminService,
  recordAdminAction,
  remoteAddress,
  resolveAdmin,
} from './admin'
import { getActor } from './context'
import { getContainer } from './container'
import { clearAdminCookie, readAdminToken, setAdminCookie } from './session-cookies'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'admin-actions' }).error({ err }, 'unexpected error in an admin action')
  return { error: 'Something went wrong. Please try again.' }
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * Prove the password and open — or refresh — an ACP session.
 *
 * The gates run in the same order `resolveAdmin` uses, and for the same reason:
 * an address outside the allowlist is refused before the board is asked
 * anything at all.
 *
 * A wrong password is reported as a wrong password. There is nothing to
 * enumerate here — the attacker already knows who they are signed in as — and a
 * vague message would only make a mistyped password look like a broken panel.
 */
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
      /*
       * Logged, and deliberately *before* the throw: a failed ACP password is
       * one of the few events on this board that is interesting on its own,
       * because reaching this form already required a valid board session and
       * the ACP permission.
       */
      await recordAdminAction({ action: 'admin.signin_failed' })
      throw new ForbiddenError('That password is not right.')
    }

    /*
     * An existing live session is *refreshed* rather than replaced. Minting a
     * second one on every re-authentication would leave a trail of live
     * sessions behind somebody who simply confirmed a deletion.
     */
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
    /*
     * Swallowed. The cookie is cleared below regardless: a sign-out that fails
     * because the database is unreachable must still stop the browser holding
     * an ACP session, and the row expires on its own within the idle window.
     */
    logger({ module: 'admin-actions' }).warn({ err }, 'admin sign-out could not revoke')
  }

  await clearAdminCookie()
  redirect('/')
}

/**
 * Where the sign-in form returns to.
 *
 * **Restricted to `/admin`**, not merely to board-relative paths. This form is
 * the one place on the board that mints elevated authority, and a `next` that
 * could point anywhere would make it a redirector with an administrator's
 * session attached.
 */
function safeAdminReturn(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/admin')) return '/admin'
  /* `//evil` and `/admin@evil` both fail this; only a real sub-path passes. */
  if (trimmed.startsWith('//') || /^\/admin[^/?#]/.test(trimmed)) return '/admin'
  return trimmed
}
