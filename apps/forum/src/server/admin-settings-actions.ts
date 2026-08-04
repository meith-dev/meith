'use server'

/**
 * F64 — saving board settings from the control panel.
 *
 * Three things happen, in this order, and the order is the design.
 *
 * 1. **Validate and write the whole batch, or none of it.** `saveSettings`
 *    already does that: it parses every key before writing any, so a form with
 *    one bad field cannot leave the board half-configured. This adapter adds
 *    nothing to it — the ACP does not get its own idea of what is valid, which
 *    is the same rule the CLI follows.
 *
 * 2. **Invalidate the tags the changed keys declare.** F08 has carried
 *    `invalidates` on every definition since it was written and nothing had
 *    ever called it: `settings.ts` reads through `cachedGlobal` with a
 *    sixty-second TTL precisely because the CLI writes out of process and
 *    cannot invalidate. An operator changing the board name in the ACP and
 *    waiting a minute to see it would reasonably conclude the save failed, so
 *    this is the writer that closes it.
 *
 * 3. **Record what changed, and never what it changed to.** The audit log gets
 *    the keys; it does not get the values. A settings value can be a secret
 *    (`secret: true`) and the log is read by more people than can edit it — and
 *    a log that recorded "board.name = X" would be a log that eventually
 *    recorded a token. The row says *who changed which settings, and when*,
 *    which is what an audit log is for.
 */
import { CacheTags, ValidationError, isAppError, logger } from '@meith/core'
import { drivers } from '@meith/drivers'
import { PostgresSettingsRepository, getDb } from '@meith/db'
import {
  SETTING_DEFINITIONS,
  coerceFormValue,
  saveSettings,
  type SettingDefinition,
} from '@meith/settings'

import { recordAdminAction, requireAdmin } from './admin'
import { getSettings } from './settings'
import type { FormState } from './auth-form-state'

/**
 * The settings this submission is allowed to touch.
 *
 * Read from the form's own `keys` field rather than from "every setting there
 * is", because the screen shows one group at a time and a filtered one at that.
 * Without it, every save would submit an unchecked box for every boolean on the
 * board — and **turn off every feature the operator could not see**. That is
 * not a hypothetical: it is what a checkbox absence means, and it is why this
 * field exists rather than the action iterating the registry.
 */
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
      throw new ValidationError('That form submitted no settings.')
    }

    const updates: Record<string, unknown> = {}
    for (const definition of definitions) {
      const raw = form.get(definition.key)
      const value = coerceFormValue(
        definition,
        typeof raw === 'string' ? raw : undefined,
      )
      /* `undefined` means "unchanged" — a secret whose box was left blank. */
      if (value !== undefined) updates[definition.key] = value
    }

    const result = await saveSettings(
      new PostgresSettingsRepository(getDb()),
      updates,
      await getSettings(),
    )

    if (result.changed.length > 0) {
      /*
       * Invalidated before this action returns, so the re-render the operator
       * is about to see cannot come from the cache they just made stale.
       *
       * `CacheTags.settings()` always, because the snapshot itself is what was
       * cached. The declared tags go through too, and some of them — `layout`,
       * `theme` — name regions that have no cached entry yet: F08 wrote them
       * ahead of the caches they describe. Passing an unknown tag to the driver
       * is a no-op, and passing it is what makes those caches correct on the
       * day somebody adds them rather than on the day somebody remembers.
       */
      await drivers().cache.invalidateTags([
        CacheTags.settings(),
        ...result.invalidates,
      ])

      await recordAdminAction({
        action: 'settings.changed',
        /* Keys only. See this file's header for why never values. */
        detail: { keys: result.changed },
      })
    }

    /*
     * No redirect. The action returns state and the screen re-renders in place,
     * which keeps the operator on the group and the search they were looking
     * at — a redirect would throw both away on every save. It works with
     * scripting off because a Server Action form is a native POST.
     */
    return { notice: result.changed.length === 0 ? 'unchanged' : 'saved' }
  } catch (err) {
    if (isAppError(err)) return { error: err.message }
    logger({ module: 'admin-settings' }).error({ err }, 'failed to save settings')
    return { error: 'Something went wrong. Please try again.' }
  }
}
