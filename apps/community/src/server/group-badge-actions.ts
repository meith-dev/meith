'use server'

import { ValidationError } from '@meith/core'

import { recordAdminAction, requireAdmin } from './admin'
import { formStateReporter } from './form-state-reporter'
import { BADGE_FIELD, removeBadge, saveBadge } from './group-badge'
import { isImageScheme, type ImageScheme } from './image-upload'
import type { FormState } from './auth-form-state'

const toFormState = formStateReporter('group-badge', 'badge write failed')

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
