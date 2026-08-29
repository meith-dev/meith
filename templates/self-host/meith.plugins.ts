/**
 * The board's installed-plugin list.
 *
 * Inside the Meith monorepo this file is generated from board.plugins.json
 * by `pnpm board:gen` (see docs/customization/plugins.md) — that generator is
 * repository tooling, not something this workspace carries, so this file
 * starts as a plain, valid file with the same shape instead. Add a plugin by
 * importing its `plugin`/`messages` exports and adding an entry:
 *
 *   import { messages as greeterMessages, plugin as greeterPlugin } from '@meith/plugin-greeter'
 *
 *   export const INSTALLED_PLUGINS: readonly InstalledPlugin<PluginDefinition>[] = [
 *     { key: 'greeter', enabled: true, plugin: greeterPlugin, messages: greeterMessages },
 *   ]
 *
 * and the matching entry in board.plugins.json, which is what
 * `community plugin:add`/`plugin:remove` read inside the monorepo — kept
 * here too so the two files agree about what is installed.
 */
import type { InstalledPlugin } from '@meith/web/config'

export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = []

export function installedPluginDefinitions() {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin)
}
