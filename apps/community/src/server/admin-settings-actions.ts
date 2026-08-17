'use server'

import { revalidatePath } from 'next/cache'

import { CacheTags, isAppError, logger, ValidationError } from '@meith/core'
import { getDb, PostgresSettingsRepository } from '@meith/db'
import { drivers } from '@meith/drivers'
import { msg } from '@meith/i18n'
import {
  coerceFormValue,
  SETTING_DEFINITIONS,
  type SettingDefinition,
  saveSettings,
  secretClearField,
} from '@meith/settings'

import { recordAdminAction, requireAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { getSettings } from './settings'

function submittedKeys(form: FormData): readonly SettingDefinition[] {
  const declared = new Set(
    (form.get('keys') ?? '')
      .toString()
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key !== ''),
  )

  return SETTING_DEFINITIONS.filter((definition) => declared.has(definition.key))
}

export async function saveAdminSettingsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const definitions = submittedKeys(form)
    if (definitions.length === 0) {
      throw new ValidationError(msg('error.app.form-submitted-settings'))
    }

    const updates: Record<string, unknown> = {}
    for (const definition of definitions) {
      const raw = form.get(definition.key)
      const value = coerceFormValue(definition, typeof raw === 'string' ? raw : undefined, {
        clear: form.get(secretClearField(definition.key)) === '1',
      })
      if (value !== undefined) updates[definition.key] = value
    }

    const result = await saveSettings(
      new PostgresSettingsRepository(getDb()),
      updates,
      await getSettings(),
    )

    if (result.changed.length > 0) {
      await drivers().cache.invalidateTags([CacheTags.settings(), ...result.invalidates])

      revalidatePath('/admin/settings')

      await recordAdminAction({
        action: 'settings.changed',
        detail: { keys: result.changed },
      })
    }

    return { notice: result.changed.length === 0 ? 'unchanged' : 'saved' }
  } catch (err) {
    if (isAppError(err)) return { error: err.message }
    logger({ module: 'admin-settings' }).error({ err }, 'failed to save settings')
    return { error: 'Something went wrong. Please try again.' }
  }
}
