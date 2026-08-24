// GENERATED FILE — do not edit.
//
// Written by scripts/board-plugins-gen.mjs from board.plugins.json. Run
// `pnpm board:gen` after changing the manifest; `pnpm verify` and CI run
// `pnpm board:gen:check` and fail when this file and the manifest disagree.

import type { InstalledPlugin } from '@meith/core'
import type { PluginDefinition } from '@meith/plugin-kit'

import { showcasePlugins } from './community.demo.plugins'

export const INSTALLED_PLUGINS: readonly InstalledPlugin<PluginDefinition>[] = [
  ...showcasePlugins(),
]

export function installedPluginDefinitions(): readonly PluginDefinition[] {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin as PluginDefinition)
}
