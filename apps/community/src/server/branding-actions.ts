'use server'

import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { recordAdminAction, requireAdmin } from './admin'
import type { FormState } from './auth-form-state'
import {
  FAVICON_FIELD,
  isLogoScheme,
  LOGO_FIELD,
  removeFavicon,
  removeLogo,
  saveFavicon,
  saveLogo,
} from './branding'
import { formStateReporter } from './form-state-reporter'

const toFormState = formStateReporter('branding', 'logo write failed')

function scheme(form: FormData): 'light' | 'dark' {
  const value = form.get('scheme')
  if (!isLogoScheme(value)) throw new ValidationError(msg('error.app.such-logo'))
  return value
}

export async function saveLogoAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const target = scheme(form)

    const file = form.get(LOGO_FIELD)
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError(msg('error.app.choose-image-first'))
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

export async function saveFaviconAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const file = form.get(FAVICON_FIELD)
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError(msg('error.app.choose-image-first'))
    }

    await saveFavicon(file)
    await recordAdminAction({ action: 'branding.favicon_saved', detail: { bytes: file.size } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function removeFaviconAction(_prev: FormState, _form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    await removeFavicon()
    await recordAdminAction({ action: 'branding.favicon_removed', detail: {} })

    return { notice: 'removed' }
  } catch (err) {
    return toFormState(err)
  }
}
