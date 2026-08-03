import 'server-only'

/**
 * F69 at the app layer — and mostly a statement about what does not exist yet.
 *
 * The roadmap line asks for six things: enable/disable, migrations, settings,
 * ACP pages, hook health, and honest install instructions. **Five of them
 * describe a plugin lifecycle that F79 defines**, and none of it is in the tree:
 * `InstalledPlugin` is `{ key, enabled? }` and deliberately opaque, there is no
 * hook registry, no plugin migration runner, no plugin settings namespace and no
 * way for a plugin to contribute a page.
 *
 * Building those five now would mean a migrations screen for plugins with no
 * migrations, a settings editor for plugins with no settings, and a hook-health
 * dashboard for a hook system that does not exist — four stubs, which is exactly
 * what D32 refuses and what F68 argued against a feature ago.
 *
 * So this reports the inventory truthfully and says what is coming and when. A
 * panel that admits a limit is worth more than one that hides it behind controls
 * that do nothing.
 */
import forumConfig from '../../forum.config'

export interface ConfiguredPlugin {
  readonly key: string
  /**
   * What `forum.config.ts` says. Build-time, like everything else in that file
   * — there is no runtime override, because nothing would read one.
   */
  readonly enabled: boolean
}

/**
 * The plugins this build has, as configured.
 *
 * This accessor exists so that F79's host has exactly one place to read the
 * registry from, rather than reaching into `forumConfig` from wherever the
 * lifecycle ends up living.
 */
export function configuredPlugins(): readonly ConfiguredPlugin[] {
  return (forumConfig.plugins ?? []).map((plugin) => ({
    key: plugin.key,
    /* Absent means enabled: a plugin somebody added to the config is one they want. */
    enabled: plugin.enabled !== false,
  }))
}
