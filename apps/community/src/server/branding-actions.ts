'use server'

import { ValidationError, isAppError, logger } from '@meith/core'

import { recordAdminAction, requireAdmin } from './admin'
import { LOGO_FIELD, isLogoScheme, removeLogo, saveLogo } from './branding'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'branding' }).error({ err }, 'logo write failed')
  return { error: 'Something went wrong. Please try again.' }
}

function scheme(form: FormData): 'light' | 'dark' {
  const value = form.get('scheme')
  if (!isLogoScheme(value)) throw new ValidationError('No such logo.')
  return value
}

export async function saveLogoAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const target = scheme(form)

    const file = form.get(LOGO_FIELD)
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError('Choose an image first.')
    }

    await saveLogo(target, file)
    await recordAdminAction({
      action: 'branding.logo_saved',
      detail: { scheme: target, bytes: file.size },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function removeLogoAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const target = scheme(form)

    await removeLogo(target)
    await recordAdminAction({ action: 'branding.logo_removed', detail: { scheme: target } })

    return { notice: 'removed' }
  } catch (err) {
    return toFormState(err)
  }
}
