/**
 * The board's installed plugins, on their own.
 *
 * Split out of `forum.config.ts` so that a program which needs to know *which
 * plugins this board has* does not have to import the themes as well. That is
 * not tidiness: `forum.config.ts` pulls in every registered theme's slot map,
 * which is React components, and the two programs that need this list —
 * `forum upgrade` and, through it, the migration planner — are plain Node
 * bundles with no business carrying a rendering tree.
 *
 * ## Why this file exists at all
 *
 * The audit of 7 August 2026 found that a plugin's migrations could never be
 * applied by anything. `/admin/plugins` said *"N migrations not applied — run
 * `forum upgrade`"*, the plugin's own page said *"Run `forum upgrade` before
 * relying on this plugin"*, and `docs/operating.md` documented the command as
 * "core, then plugins, then record the version" — while `apps/cli/src/index.ts`
 * passed `plugins: []` unconditionally, on the reasoning that "an operator CLI
 * installed from npm has no path to `forum.config.ts`".
 *
 * That reasoning does not describe this repository. `@meith/cli` is
 * `private: true` and is not published; it ships inside the image, built from
 * this tree, where the config is two directories away. So the CLI imports this
 * list *statically*, esbuild bundles it into `cli.cjs`, and the command does
 * what three places already claimed it did.
 *
 * A board that adds a plugin therefore pays for that plugin's module in the CLI
 * bundle, which is correct rather than unfortunate: applying a plugin's
 * migrations means having the plugin, and its migrations are `{ id, statements }`
 * — data it declares about itself, and the only honest source for them.
 */
import type { InstalledPlugin } from '@meith/core'
import type { PluginDefinition } from '@meith/plugin-kit'

/**
 * Empty because this board installs none, not because plugins are unfinished:
 * the lifecycle is F79's and its execution is F69's, so a plugin listed here
 * gets its hooks called, its migrations applied by `forum upgrade`, its settings
 * edited in the panel, its tasks on the tick and its pages under
 * `/admin/plugins/<key>`.
 *
 * Installing one is `pnpm add`, a line here, and a redeploy — the worked example
 * to copy is `examples/hello-plugin`, and registering it verbatim is
 * `{ key: 'hello', plugin: helloPlugin }` with the matching import.
 *
 * `plugins/reference` is deliberately *not* registered. It exercises every
 * extension point and records what it was called with, which is a test double —
 * shipping it on a real board would be shipping a fixture.
 */
export const INSTALLED_PLUGINS: readonly InstalledPlugin<PluginDefinition>[] = []

/**
 * The definitions `forum upgrade` plans over.
 *
 * Two filters, and both are load-bearing:
 *
 *  - **No definition, no migrations.** An entry may be a key alone — a board can
 *    name a plugin it has switched off without the bundler pulling in its code
 *    — and there is nothing to apply for one.
 *  - **`enabled: false` is skipped.** Creating tables for code that will not run
 *    leaves a schema ahead of the board, which is the state the panel's refusal
 *    to offer a migrate button exists to prevent. Absent still means enabled.
 */
export function installedPluginDefinitions(): readonly PluginDefinition[] {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin as PluginDefinition)
}
