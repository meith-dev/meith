import 'server-only'

/**
 * F79 at the app layer — the board's one plugin host.
 *
 * Built once at module load from `community.config.ts`, for the same reason
 * the resolved theme map is: the registry is static, so constructing a host per request
 * would sort the same handler lists into the same order on every page.
 *
 * ## Disabled plugins are never passed in
 *
 * The host has no notion of a plugin it knows about but must not call, and that
 * is deliberate: a filter chain that has to consult a flag on every entry is a
 * flag somebody eventually forgets to check. A plugin the config disables simply
 * is not in the host, so there is no path through which it can run.
 *
 * The host's own `disable()` is a different thing — the in-process reaction to
 * repeated failures, which stops on the next call rather than on the next
 * deploy.
 *
 * ## The operator's switch, and where it is applied (F69)
 *
 * There is now a third state: a plugin the config enables and an administrator
 * has switched off in the panel. It is durable — a row in `settings` — because a
 * kill switch that a redeploy undoes is not a kill switch, and the plugin an
 * operator turned off at 2am is exactly the one that must stay off.
 *
 * Reading it costs nothing, which is what made it possible at all: the settings
 * table is already fetched and cached per request (F08/F10), so
 * `syncOperatorDisables` reconciles the host against a map the request was
 * holding anyway. That is the loophole in D85's objection — the objection was to
 * a *connection opened from inside a render*, and this is not one.
 *
 * **What it reaches, precisely.** The reconcile is awaited by `filterView` and
 * `emitEvent`, so those stop calling a disabled plugin on the same request.
 * `pluginRegion` is synchronous — React render — and therefore sees whatever the
 * last reconcile set. In practice the shell's own filters run before any theme
 * renders a region, so a page load reconciles before it contributes; the honest
 * statement of the gap is that a request which renders a region *without* going
 * through a filter first would use the previous value.
 */
import { logger } from '@meith/core/logger'
import { PluginHost, operatorDisabledPlugins, type PluginDefinition } from '@meith/plugin-kit'
import { cache } from 'react'

import communityConfig from '../../community.config'
import { getSettingOverrides } from './settings'

export interface ConfiguredPlugin {
  readonly key: string
  /**
   * What `community.config.ts` says. Build-time, like everything else in that file.
   *
   * **Not the whole answer to "is it on".** F69 added a durable operator switch
   * that can turn off a plugin this says is enabled — it cannot turn one *on*,
   * because the code has to be in the build either way. The panel is the reader
   * that has to show both; everything else here is only ever told about plugins
   * it may call.
   */
  readonly enabled: boolean
  /** `false` for an entry that names a key but registers no definition. */
  readonly hasDefinition: boolean
  readonly name: string | null
  readonly version: string | null
}

/**
 * The plugins this build has, as configured.
 *
 * The one trap, and it has a test: **`enabled` is optional and absent means
 * enabled.** Reading `undefined` as off would make every plugin registered
 * without the flag silently inert, and "installs cleanly, does nothing" is a
 * symptom nobody looks for in an accessor.
 */
export function configuredPlugins(): readonly ConfiguredPlugin[] {
  return (communityConfig.plugins ?? []).map((entry) => {
    const definition = entry.plugin as PluginDefinition | undefined
    return {
      key: entry.key,
      enabled: entry.enabled !== false,
      hasDefinition: definition !== undefined,
      name: definition?.name ?? null,
      version: definition?.version ?? null,
    }
  })
}

/** Enabled plugins that actually carry code. */
export function activeDefinitions(): readonly PluginDefinition[] {
  return (communityConfig.plugins ?? [])
    .filter((entry) => entry.enabled !== false && entry.plugin !== undefined)
    .map((entry) => entry.plugin as PluginDefinition)
}

/**
 * The board's host.
 *
 * A module-level constant rather than a `getHost()`: it holds the failure
 * counters, and a function that built a new one per call would reset them on
 * every request — which is auto-disable that can never trigger.
 */
export const pluginHost = new PluginHost({
  plugins: activeDefinitions(),
  logger: {
    warn: (message, detail) => logger().warn(detail, message),
    error: (message, detail) => logger().error(detail, message),
  },
})

/**
 * Carry the operator's stored choice into this instance, once per request.
 *
 * `cache()` rather than a module-level "already done" flag, and the difference
 * matters: a flag would reconcile once per *process*, so an instance that was
 * warm when an administrator disabled a plugin would go on calling it until the
 * platform recycled it — which is precisely the failure durable disabling exists
 * to prevent. Per request is the coarsest granularity that is still correct.
 *
 * Failure-tolerant on purpose. A settings read that fails leaves the host as it
 * was, because the alternative — treating an unreadable table as "everything is
 * disabled" — turns a transient database blip into a board that silently drops
 * every plugin's contribution.
 */
export const syncOperatorDisables = cache(async (): Promise<void> => {
  try {
    pluginHost.setOperatorDisabled(operatorDisabledPlugins(await getSettingOverrides()))
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read plugin enablement')
  }
})
