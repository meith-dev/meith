'use server'

import { CacheTags, ValidationError, isAppError, logger } from '@meith/core'
import { PostgresSettingsRepository, getDb } from '@meith/db'
import { drivers } from '@meith/drivers'
import { revalidatePath } from 'next/cache'
import {
  parsePluginSetting,
  pluginEnabledKey,
  pluginSettingType,
  serialisePluginSetting,
  type PluginDefinition,
} from '@meith/plugin-kit'

import forumConfig from '../../community.config'
import { recordAdminAction, requireAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { syncOperatorDisables } from './plugin-host'

function requireDefinition(key: string): PluginDefinition {
  const entry = (forumConfig.plugins ?? []).find((candidate) => candidate.key === key)
  const definition = entry?.plugin as PluginDefinition | undefined

  if (entry === undefined) {
    throw new ValidationError(`No plugin named "${key}" is installed on this board.`)
  }
  if (definition === undefined) {
    throw new ValidationError(
      `"${key}" is registered without a definition, so there is nothing to configure.`,
    )
  }
  return definition
}

async function invalidateSettings(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.settings()])
  revalidatePath('/admin/plugins')
  revalidatePath('/admin/plugins/[key]/[[...path]]', 'page')
}

export async function setPluginEnabledAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const key = String(form.get('key') ?? '')
    const enabled = form.get('enabled') === '1'
    requireDefinition(key)

    const repository = new PostgresSettingsRepository(getDb())
    if (enabled) {
      await repository.delete([pluginEnabledKey(key)])
    } else {
      await repository.save(new Map([[pluginEnabledKey(key), '0']]))
    }

    await invalidateSettings()
    await syncOperatorDisables()

    await recordAdminAction({
      action: enabled ? 'plugin.enabled' : 'plugin.disabled',
      detail: { plugin: key },
    })

    return { notice: enabled ? 'enabled' : 'disabled' }
  } catch (err) {
    if (isAppError(err)) return { error: err.message }
    logger({ module: 'plugin-admin' }).error({ err }, 'failed to change plugin enablement')
    return { error: 'Something went wrong. Please try again.' }
  }
}

export async function savePluginSettingsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const key = String(form.get('key') ?? '')
    const definition = requireDefinition(key)
    const declared = definition.settings ?? []

    if (declared.length === 0) {
      throw new ValidationError(`"${key}" declares no settings.`)
    }

    const updates = new Map<string, string>()
    for (const setting of declared) {
      const field = `setting.${setting.key}`
      const type = pluginSettingType(setting)
      const raw = form.get(field)

      // A field the environment owns arrives disabled and absent; writing a
      // stored value under it would be a value nobody sees until the
      // variable is unset, which is a surprise saved up for later.
      if (raw === null && type !== 'boolean') continue

      if (type === 'boolean') {
        updates.set(`plugin.${key}.${setting.key}`, raw === '1' ? '1' : '0')
        continue
      }

      if (type === 'secret') {
        // Write-only: blank means "keep what is stored", because the form
        // can never show the current value to re-submit.
        if (typeof raw !== 'string' || raw === '') continue
        updates.set(`plugin.${key}.${setting.key}`, raw)
        continue
      }

      if (type === 'select') {
        const value = typeof raw === 'string' ? raw : ''
        if (!(setting.options ?? []).some((option) => option.value === value)) {
          throw new ValidationError(`“${setting.label}” must be one of its listed options.`)
        }
        updates.set(`plugin.${key}.${setting.key}`, value)
        continue
      }

      const parsed = parsePluginSetting(setting, typeof raw === 'string' ? raw : '')
      if (parsed === null) {
        throw new ValidationError(
          `“${setting.label}” needs ${typeof setting.default === 'number' ? 'a number' : 'a value'}.`,
        )
      }
      updates.set(`plugin.${key}.${setting.key}`, serialisePluginSetting(parsed))
    }

    await new PostgresSettingsRepository(getDb()).save(updates)
    await invalidateSettings()

    await recordAdminAction({
      action: 'plugin.configured',
      detail: { plugin: key, keys: [...updates.keys()] },
    })

    return { notice: 'saved' }
  } catch (err) {
    if (isAppError(err)) return { error: err.message }
    logger({ module: 'plugin-admin' }).error({ err }, 'failed to save plugin settings')
    return { error: 'Something went wrong. Please try again.' }
  }
}
