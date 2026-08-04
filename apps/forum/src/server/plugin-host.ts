import 'server-only'

/**
 * F79 at the app layer — the board's one plugin host.
 *
 * Built once at module load from `forum.config.ts`, for the same reason
 * `activeTheme` is: the registry is static, so constructing a host per request
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
 */
import { logger } from '@meith/core/logger'
import { PluginHost, type PluginDefinition } from '@meith/plugin-kit'

import forumConfig from '../../forum.config'

export interface ConfiguredPlugin {
  readonly key: string
  /**
   * What `forum.config.ts` says. Build-time, like everything else in that file
   * — there is no runtime override, because nothing would read one.
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
  return (forumConfig.plugins ?? []).map((entry) => {
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
function activeDefinitions(): readonly PluginDefinition[] {
  return (forumConfig.plugins ?? [])
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
