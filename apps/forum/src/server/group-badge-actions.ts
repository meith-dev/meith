'use server'

/**
 * A usergroup badge's writes.
 *
 * Both behind `requireAdmin`, both recording the scheme and the size and never
 * the filename — the board logo's rule, for the same reason: a log outlives the
 * file, and a name somebody chose is not something it should carry.
 *
 * The validation is `image-upload.ts`'s, shared with the logo. This file is the
 * gate and the audit entry; what a file *is* is decided in one place.
 */
import { ValidationError, isAppError, logger } from '@meith/core'

import { recordAdminAction, requireAdmin } from './admin'
import { BADGE_FIELD, removeBadge, saveBadge } from './group-badge'
import { isImageScheme, type ImageScheme } from './image-upload'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'group-badge' }).error({ err }, 'badge write failed')
  return { error: 'Something went wrong. Please try again.' }
}

function target(form: FormData): { groupId: number; scheme: ImageScheme } {
  const raw = form.get('groupId')
  const groupId = typeof raw === 'string' ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new ValidationError('No such group.')
  }

  const scheme = form.get('scheme')
  if (!isImageScheme(scheme)) throw new ValidationError('No such badge.')

  return { groupId, scheme }
}

export async function saveBadgeAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const { groupId, scheme } = target(form)

    const file = form.get(BADGE_FIELD)
    /*
     * An empty `<input type="file">` still posts — as a zero-byte `File` in
     * every browser this board supports. Both that and a missing field mean
     * "nothing was chosen", and neither should reach the store.
     */
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError('Choose an image first.')
    }

    await saveBadge(groupId, scheme, file)
    await recordAdminAction({
      action: 'group.badge_saved',
      detail: { groupId, scheme, bytes: file.size },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function removeBadgeAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const { groupId, scheme } = target(form)

    await removeBadge(groupId, scheme)
    await recordAdminAction({ action: 'group.badge_removed', detail: { groupId, scheme } })

    return { notice: 'removed' }
  } catch (err) {
    return toFormState(err)
  }
}
