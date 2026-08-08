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

import { MemberSettingsService } from '@meith/accounts'
import { ForbiddenError, ValidationError, isAppError, logger } from '@meith/core'
import { drivers } from '@meith/drivers'
import { prepareSignature } from '@meith/signatures'

import { boardAuthConfig } from './auth-config'
import { adminService } from './admin'
import { AVATAR_FIELD, canUploadAvatar, requireAvatarService } from './avatars'
import { getActor } from './context'
import { getContainer } from './container'
import { profileFieldService, submittedFields, viewerFieldContext } from './profile-fields'
import { signatureStore, viewerSignatureLimits } from './signatures'
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

    /*
     * F59's custom fields, saved from the same form and the same button — they
     * are one screen to a member, so two Save buttons would be two chances to
     * lose half the changes.
     *
     * Every submitted name is passed through, and the *service* decides which
     * of them this actor may actually write: a field they cannot edit is
     * dropped silently rather than refused, because an error naming the field
     * would confirm a staff-only field exists.
     */
    const fields = profileFieldService()
    const context = await viewerFieldContext()
    if (fields !== null && context !== null) {
      await fields.save({ userId, submitted: submittedFields(form), context })
    }
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
      /*
       * F75. An unchecked checkbox submits nothing at all, so absence is
       * false — which is also the safe reading: a member who did not tick the
       * box is visible, and a form that lost the field cannot silently hide
       * somebody who did not ask to be hidden.
       */
      invisible: form.get('invisible') !== null,
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
      /* The board's configured minimum (F13), not the built-in one. */
      minLength: (await boardAuthConfig()).minPasswordLength,
    })

    /*
     * The service has just revoked every session, this one included. A fresh
     * one keeps the device that made the change signed in — which is what
     * everybody expects — while every other device is signed out, which is the
     * point of changing a password.
     */
    const session = await getContainer().sessions.start(userId)
    await setSessionCookie(session.token, session.expiresAt)

    /*
     * F63. The ACP session is separate from the board session, so revoking
     * every board session leaves it standing — which would mean a password
     * change did not close the one session that matters most. Revoked here
     * rather than inside the service, because `@meith/accounts` has no idea
     * the control panel exists.
     */
    const admin = adminService()
    if (admin !== null) await admin.endAllFor(userId)
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

/**
 * F58 — save your signature.
 *
 * Its own verb rather than a field on `saveProfileAction`, because a signature
 * is group-limited and lockable and the profile form is neither: folding them
 * together would mean the profile save carrying a permission check that has
 * nothing to do with the other three fields.
 */
export async function saveSignatureAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { signature: text(form, 'signature') }

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    const store = signatureStore()
    if (store === null) {
      throw new ForbiddenError(
        'This board is running on in-memory sample data, so it has no signatures to save.',
      )
    }

    const limits = await viewerSignatureLimits()
    const { source, rendered } = prepareSignature(values.signature, limits)

    /*
     * The lock is enforced in the UPDATE's `where`, not by a prior read: a
     * moderator locking a signature while this member has the form open is
     * exactly the race a read would lose. A refused write is reported as the
     * lock rather than as a failure.
     */
    const wrote = await store.save({
      userId: actor.userId,
      signature: source,
      signatureHtml: rendered.html,
      renderVersion: rendered.version,
    })

    if (!wrote) {
      throw new ForbiddenError(
        'Your signature has been locked by a moderator, so it cannot be changed.',
      )
    }
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/signature?saved=1')
}


/* ------------------------------------------------------------------ *
 * F58 — the avatar
 * ------------------------------------------------------------------ */

/**
 * Upload a new avatar.
 *
 * Like every attachment (D65) the file is validated in the request and
 * **re-encoded in a queued job**, so what comes back is "we are working on it"
 * rather than a finished image. Saying so is the honest thing: an avatar screen
 * that redirected to a page still showing the old face with no explanation is
 * how somebody concludes the upload silently failed.
 */
export async function saveAvatarAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const actor = await getActor()
    const service = requireAvatarService(actor)

    const file = form.get(AVATAR_FIELD)
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError('Choose an image first.')
    }

    await service.upload({
      userId: actor.userId as number,
      file: { filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
      /*
       * Asked here rather than inside the service: group and permission
       * reasoning does not leave `@meith/authorization` (R4), so the service
       * takes the answer. The *lock* is the service's, because it is a sanction
       * on one member rather than a permission.
       */
      mayUpload: canUploadAvatar(actor),
    })

    await drivers().queue.enqueue(
      'avatars.process',
      { userId: actor.userId },
      { dedupeKey: `avatar:${actor.userId}:${Date.now()}` },
    )
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/avatar?saved=processing')
}

/** Remove it. A lock stops this exactly as it stops an upload. */
export async function removeAvatarAction(_prev: FormState): Promise<FormState> {
  try {
    const actor = await getActor()
    const service = requireAvatarService(actor)
    await service.remove(actor.userId as number)
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/avatar?saved=removed')
}
