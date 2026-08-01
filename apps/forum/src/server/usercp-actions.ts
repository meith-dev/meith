'use server'

/**
 * F57 — the UserCP's Server Actions.
 *
 * Four verbs, and they split by what getting one wrong costs.
 *
 * `saveProfileAction` and `saveOptionsAction` change what a member looks like
 * and how pages render for them. They validate and save, scoped to the
 * signed-in user id.
 *
 * `changePasswordAction` and `requestEmailChangeAction` change *the account*,
 * and both re-authenticate with the current password first — a session left
 * open on a shared machine is otherwise a full takeover: change the address,
 * request a reset, and the real owner is locked out of their own board.
 *
 * The user id never comes from the form on any of them. It is the session's,
 * which is what makes "edit somebody else's profile" unreachable rather than
 * merely unchecked.
 */
import { redirect } from 'next/navigation'

import { MemberSettingsService } from '@forum/accounts'
import { ForbiddenError, isAppError, logger } from '@forum/core'

import { AUTH_CONFIG } from './auth-config'
import { getActor } from './context'
import { getContainer } from './container'
import { sendEmailChangeConfirmation } from './usercp-mail'
import { setSessionCookie } from './session-cookies'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'usercp-actions' }).error({ err }, 'unexpected error in the UserCP')
  return { error: 'Something went wrong. Please try again.' }
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * The service, and the member it acts for.
 *
 * One place, so no verb can be written that forgets either half — and so
 * "fixture mode has no settings store" is refused once rather than four times.
 */
async function requireOwnSettings(): Promise<{
  service: MemberSettingsService
  userId: number
}> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

  const { memberSettings, accountStore } = getContainer()
  if (memberSettings === null || accountStore === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so it has no settings to save.',
    )
  }

  return {
    service: new MemberSettingsService({
      settings: memberSettings,
      accounts: accountStore.accounts,
      sessions: accountStore.sessions,
      tokens: accountStore.tokens,
    }),
    userId: actor.userId,
  }
}

export async function saveProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { service, userId } = await requireOwnSettings()
    await service.saveProfile({
      userId,
      location: text(form, 'location'),
      website: text(form, 'website'),
      bio: text(form, 'bio'),
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/profile?saved=1')
}

export async function saveOptionsAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { service, userId } = await requireOwnSettings()
    await service.saveOptions({
      userId,
      timezone: text(form, 'timezone'),
      postsPerPage: text(form, 'postsPerPage'),
      threadsPerPage: text(form, 'threadsPerPage'),
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/options?saved=1')
}

/**
 * Change the password.
 *
 * The service revokes **every** session, including this one — a password change
 * that leaves an attacker's session alive has done nothing. A fresh session is
 * then started for the device that made the change, so the member stays signed
 * in where they are and is signed out everywhere else, which is what everybody
 * expects and nobody says out loud.
 */
export async function changePasswordAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const { service, userId } = await requireOwnSettings()

    const next = text(form, 'newPassword')
    if (next !== text(form, 'confirmPassword')) {
      return { error: 'The two new passwords do not match.' }
    }

    await service.changePassword({
      userId,
      currentPassword: text(form, 'currentPassword'),
      newPassword: next,
      minLength: AUTH_CONFIG.minPasswordLength,
    })

    /*
     * The service has just revoked every session, this one included. A fresh
     * one keeps the device that made the change signed in — which is what
     * everybody expects — while every other device is signed out, which is the
     * point of changing a password.
     */
    const session = await getContainer().sessions.start(userId)
    await setSessionCookie(session.token, session.expiresAt)
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?changed=password')
}

/**
 * Ask to change the e-mail address.
 *
 * Nothing moves yet. The address is carried in a token e-mailed **to the new
 * address**, and adopted only when that link is followed — which is what proves
 * the member can actually receive mail there, and what stops a typo from
 * stranding an account at an address nobody owns.
 */
export async function requestEmailChangeAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  let pending: { token: string; email: string }
  try {
    const { service, userId } = await requireOwnSettings()

    pending = await service.requestEmailChange({
      userId,
      currentPassword: text(form, 'currentPassword'),
      newEmail: text(form, 'newEmail'),
    })
  } catch (err) {
    return toFormState(err)
  }

  /*
   * Queued through F55's mail path, and a failure to send is *not* a failure of
   * the request: the token is issued and the member can ask again. Reporting a
   * mail-provider outage as "your e-mail change failed" would be a lie about
   * what happened.
   */
  await sendEmailChangeConfirmation(pending).catch(() => undefined)

  redirect('/usercp/security?sent=1')
}
