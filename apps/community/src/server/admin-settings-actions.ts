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
import { tr } from './i18n'
import { emitEvent } from './plugin-view'
import { searchProvider } from './search'
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
    const admin = await requireAdmin()

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

    if (result.changed.includes('search.language')) {
      await searchProvider()?.markForReindex()
    }

    if (result.changed.length > 0) {
      const tags = [CacheTags.settings(), ...result.invalidates]
      await drivers().cache.invalidateTags(tags)
      revalidatePath('/admin/settings')

      await Promise.all([
        ...tags.map((tag) => emitEvent('cache.invalidated', { tag }, {})),
        emitEvent('settings.saved', { keys: result.changed }, { adminId: admin.session.userId }),
        recordAdminAction({
          action: 'settings.changed',
          detail: { keys: result.changed },
        }),
      ])
    }

    return { notice: result.changed.length === 0 ? 'unchanged' : 'saved' }
  } catch (err) {
    if (isAppError(err)) return { error: err.message }
    logger({ module: 'admin-settings' }).error({ err }, 'failed to save settings')
    return { error: await tr('notice.app.something-went-wrong-please-try') }
  }
}
