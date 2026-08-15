'use server'

import { redirect } from 'next/navigation'

import { MemberSettingsService } from '@meith/accounts'
import { ForbiddenError, ValidationError } from '@meith/core'
import { drivers } from '@meith/drivers'
import { prepareSignature } from '@meith/signatures'

import { boardAuthConfig } from './auth-config'
import { adminService } from './admin'
import { AVATAR_FIELD, canUploadAvatar, requireAvatarService } from './avatars'
import { getActor } from './context'
import { configuredSessions, getContainer } from './container'
import { assertDemoAccountChangeable } from './demo'
import { formStateReporter } from './form-state-reporter'
import { text } from './form-values'
import { profileFieldService, submittedFields, viewerFieldContext } from './profile-fields'
import { signatureStore, viewerSignatureLimits } from './signatures'
import { sendEmailChangeConfirmation } from './usercp-mail'
import { setSessionCookie } from './session-cookies'
import type { FormState } from './auth-form-state'

const toFormState = formStateReporter('usercp-actions', 'unexpected error in the UserCP')

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

export async function saveDisplayGroupAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const { service, userId } = await requireOwnSettings()
    await service.saveDisplayGroup({ userId, displayGroupId: text(form, 'displayGroupId') })
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
      invisible: form.get('invisible') !== null,
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/options?saved=1')
}

export async function changePasswordAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const { service, userId } = await requireOwnSettings()

    await assertDemoAccountChangeable(userId, 'password')

    const next = text(form, 'newPassword')
    if (next !== text(form, 'confirmPassword')) {
      return { error: 'The two new passwords do not match.' }
    }

    await service.changePassword({
      userId,
      currentPassword: text(form, 'currentPassword'),
      newPassword: next,
      minLength: (await boardAuthConfig()).minPasswordLength,
    })

    const session = await (await configuredSessions()).start(userId)
    await setSessionCookie(session.token, session.expiresAt)

    const admin = adminService()
    if (admin !== null) await admin.endAllFor(userId)
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?changed=password')
}

export async function requestEmailChangeAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  let pending: { token: string; email: string }
  try {
    const { service, userId } = await requireOwnSettings()

    await assertDemoAccountChangeable(userId, 'email')

    pending = await service.requestEmailChange({
      userId,
      currentPassword: text(form, 'currentPassword'),
      newEmail: text(form, 'newEmail'),
    })
  } catch (err) {
    return toFormState(err)
  }

  await sendEmailChangeConfirmation(pending).catch(() => undefined)

  redirect('/usercp/security?sent=1')
}

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
