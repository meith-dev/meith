'use server'

/**
 * The board logo's writes.
 *
 * Two actions, both behind `requireAdmin`, both recording what happened without
 * recording what was in the file. The audit entry says which scheme changed and
 * how big the image was — enough to answer "when did the header change and who
 * did it", and nothing that would put a filename somebody chose into a log that
 * outlives the file.
 *
 * The validation lives in `branding.ts` beside the storage it protects, for the
 * reason the theme editor gives about F26's validators: a check that lives with
 * its writer eventually disagrees with the reader it was meant to protect.
 */
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
    /*
     * A `<input type="file">` that was left empty still posts — as an empty
     * `File` in every browser this board supports, and as the empty string in
     * one or two older ones. Both are "nothing was chosen", and neither should
     * reach the store.
     */
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError('Choose an image first.')
    }

    await saveLogo(target, file)
    await recordAdminAction({
      action: 'branding.logo_saved',
      /* The scheme and the size. Never the filename, never the bytes. */
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
