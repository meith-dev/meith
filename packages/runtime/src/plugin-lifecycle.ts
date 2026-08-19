import type { Database } from '@meith/db'
import type { PluginDefinition } from '@meith/plugin-kit'

import { pluginRuntimeContext } from './plugin-context'

export type PluginLifecyclePhase = 'install' | 'enable' | 'disable' | 'uninstall'

const CALLBACKS: Readonly<Record<PluginLifecyclePhase, keyof PluginDefinition>> = {
  install: 'onInstall',
  enable: 'onEnable',
  disable: 'onDisable',
  uninstall: 'onUninstall',
}

/**
 * Run one lifecycle callback, or report that the plugin declares none.
 *
 * It throws what the callback throws, deliberately. These do not run inside the
 * host's try/catch, because that isolation exists to keep a page rendering and
 * none of these is on a page: an install that half-worked should stop the
 * deploy rather than be swallowed, and each caller states its own policy.
 */
export async function runPluginLifecycle(input: {
  readonly db: Database
  readonly plugin: PluginDefinition
  readonly phase: PluginLifecyclePhase
  readonly overrides?: ReadonlyMap<string, string>
}): Promise<{ readonly ran: boolean }> {
  const callback = input.plugin[CALLBACKS[input.phase]]
  if (typeof callback !== 'function') return { ran: false }

  const context = await pluginRuntimeContext({
    db: input.db,
    plugin: input.plugin,
    component: `plugin-${input.phase}`,
    ...(input.overrides === undefined ? {} : { overrides: input.overrides }),
  })

  await (callback as (ctx: typeof context) => Promise<void> | void)(context)
  return { ran: true }
}
