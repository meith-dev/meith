'use server'

/**
 * F69 — the two writes the plugin manager makes.
 *
 * Both land in the `settings` table, both invalidate `CacheTags.settings()`,
 * and both reconcile the host before returning. That last step is what makes
 * the switch feel like a switch: the operator's next render is served by the
 * same instance that just handled the POST, and an instance that had not
 * reconciled would show them the plugin still running.
 *
 * ## Why disabling is not re-authenticated, and uninstalling is not offered
 *
 * Disabling a plugin is the *recovery* action — the thing an administrator does
 * at speed when a plugin is breaking the board — so a password prompt in front
 * of it is a prompt in front of the fix. Same reasoning as F68's theme reset.
 *
 * There is no uninstall, because there is nothing here that could perform one.
 * A plugin's code is in the bundle; removing it is `pnpm remove`, a line out of
 * `forum.config.ts`, and a redeploy. A button that dropped the rows and left the
 * code running would be the worst of the three states.
 */
import { CacheTags, ValidationError, isAppError, logger } from '@meith/core'
import { PostgresSettingsRepository, getDb } from '@meith/db'
import { drivers } from '@meith/drivers'
import {
  parsePluginSetting,
  pluginEnabledKey,
  serialisePluginSetting,
  type PluginDefinition,
} from '@meith/plugin-kit'

import forumConfig from '../../forum.config'
import { recordAdminAction, requireAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { syncOperatorDisables } from './plugin-host'

/**
 * The definition behind a submitted key, or a refusal.
 *
 * A form naming a plugin this build does not contain is not a 404 — it is a
 * write that would create a settings row nothing will ever read, on a board
 * where the plugin might later be installed with a different meaning for that
 * key. Refused rather than stored.
 */
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

/** Both writes invalidate the same tag, because both wrote to the same table. */
async function invalidateSettings(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.settings()])
}

/**
 * Switch a plugin on or off durably.
 *
 * Enabling **deletes** the row rather than storing `"1"`, which is the same
 * choice F68 made for a theme reset and rests on the same argument: absence and
 * `"1"` are identical to every reader, and only one of them leaves the table
 * looking like a board where nobody ever touched this plugin.
 */
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

/**
 * Save a plugin's settings.
 *
 * Two things worth the lines they take:
 *
 * **Submitted fields are read from the plugin's declaration, not from the
 * form.** The opposite of F68's theme editor, and for the opposite reason: a
 * theme accepts tokens it did not declare, a plugin does not — its settings are
 * a closed set that `definePlugin` validated, so a key arriving from the form
 * that is not in that set is either a stale tab or somebody hand-posting.
 *
 * **An unchecked box is `false`, not "unchanged".** Booleans are read by
 * absence, which is why the whole declared set is walked: iterating the *form*
 * would silently skip every box the operator cleared, and a settings screen
 * whose off-switches do nothing is a bug that takes a long time to notice.
 * (The mirror of F64's problem, which is why that action does the reverse — it
 * shows one group at a time, so its risk is unchecking what is off-screen.
 * Here the screen always shows every setting the plugin has.)
 */
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

      if (typeof setting.default === 'boolean') {
        updates.set(`plugin.${key}.${setting.key}`, form.get(field) === '1' ? '1' : '0')
        continue
      }

      const raw = form.get(field)
      const parsed = parsePluginSetting(setting, typeof raw === 'string' ? raw : '')
      if (parsed === null) {
        throw new ValidationError(
          `“${setting.label}” needs ${typeof setting.default === 'number' ? 'a number' : 'a value'}.`,
        )
      }
      updates.set(`plugin.${key}.${setting.key}`, serialisePluginSetting(parsed))
    }

    /*
     * Every declared setting is written, including ones equal to the default.
     * A plugin's defaults can change between versions, and an operator who
     * looked at this form and pressed save meant "these values" rather than
     * "whatever this plugin decides next release".
     */
    await new PostgresSettingsRepository(getDb()).save(updates)
    await invalidateSettings()

    await recordAdminAction({
      action: 'plugin.configured',
      /* Keys only, never values — a plugin setting can hold an API token. */
      detail: { plugin: key, keys: [...updates.keys()] },
    })

    return { notice: 'saved' }
  } catch (err) {
    if (isAppError(err)) return { error: err.message }
    logger({ module: 'plugin-admin' }).error({ err }, 'failed to save plugin settings')
    return { error: 'Something went wrong. Please try again.' }
  }
}
