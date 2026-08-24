#!/usr/bin/env node
/**
 * The board.plugins.json manifest: what a valid entry looks like, and the
 * community.plugins.ts it compiles down to. `scripts/board-plugins-gen.mjs`
 * is the only caller — `community plugin:add`/`plugin:remove`
 * (apps/cli/src/plugin-manifest.ts) edit the manifest and then run that
 * generator as a subprocess rather than importing this file, because a
 * plain script here and a workspace TypeScript package cannot share a
 * module without one of them changing what it is. Either way there is one
 * place these rules are written down.
 *
 * Nothing in this file has a top-level effect — every export is a function
 * that touches only what its arguments name — so it can be imported from a
 * test (tests/board-plugins-gen.test.ts) without generating anything for real.
 */

import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Mirrors KEY_PATTERN in packages/plugin-kit/src/plugin.ts. definePlugin()
// is the real authority — a manifest key that does not match the plugin's
// own declared key fails loudly in defineForumConfig() — this copy exists
// so a bad manifest fails before a build does, with a message that names
// board.plugins.json instead of a file the operator never opened.
export const PLUGIN_KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/

/**
 * A legal PLUGIN_KEY_PATTERN key does not guarantee toIdentifier(key) below produces a
 * valid TypeScript binding name. See docs/plugin-api.md, "The board plugin manifests".
 */
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Narrower than the full npm registry grammar (scopes, dots, tildes) — this only needs
 * to keep entry.package from becoming anything other than an import specifier once
 * renderPluginsModule interpolates it.
 */
const NPM_PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

export const HEADER = `// GENERATED FILE — do not edit.
//
// Written by scripts/board-plugins-gen.mjs from board.plugins.json. Run
// \`pnpm board:gen\` after changing the manifest; \`pnpm verify\` and CI run
// \`pnpm board:gen:check\` and fail when this file and the manifest disagree.
`

/**
 * @typedef {{ readonly key: string, readonly package: string, readonly enabled?: boolean }} ManifestEntry
 */

/**
 * Refuses a manifest that cannot become a working community.plugins.ts.
 * Throws a plain Error with an actionable message and does not touch the
 * filesystem — the caller decides what "apps/community" means and how to
 * spell the fix.
 *
 * @param {readonly ManifestEntry[]} plugins
 * @param {ReadonlySet<string>} dependencies the board package's own "dependencies" keys
 * @param {string} manifestFile the manifest's path, as named in the error (e.g.
 *   "apps/community/board.plugins.json")
 * @param {{ readonly packageLabel?: string, readonly filterName?: string }} [options]
 *   packageLabel: the board package's directory, named in the "is not a dependency of …"
 *   message (default "apps/community"). filterName: the `--filter` target named in the
 *   fix it suggests (default "@meith/web").
 */
export function validateManifest(plugins, dependencies, manifestFile, options = {}) {
  const { packageLabel = 'apps/community', filterName = '@meith/web' } = options
  const seen = new Set()
  const identifiers = new Map()

  for (const entry of plugins) {
    if (typeof entry.key !== 'string' || typeof entry.package !== 'string') {
      throw new Error(
        `${manifestFile}: every entry needs a string "key" and "package". Got ` +
          `${JSON.stringify(entry)}.`,
      )
    }

    if (seen.has(entry.key)) {
      throw new Error(`${manifestFile}: "${entry.key}" is listed twice.`)
    }
    seen.add(entry.key)

    if (!PLUGIN_KEY_PATTERN.test(entry.key)) {
      throw new Error(
        `${manifestFile}: "${entry.key}" is not a valid plugin key. definePlugin requires ` +
          'lower-case letters, digits and hyphens, starting with a letter, 2-40 characters long.',
      )
    }

    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
      throw new Error(
        `${manifestFile}: "${entry.key}" has a non-boolean "enabled" ` +
          `(${JSON.stringify(entry.enabled)}). Omit the field to enable the plugin, or set it ` +
          'to true or false.',
      )
    }

    if (!NPM_PACKAGE_NAME_PATTERN.test(entry.package) || entry.package.length > 214) {
      throw new Error(
        `${manifestFile}: "${entry.package}" (key "${entry.key}") is not a valid npm package ` +
          'name.',
      )
    }

    const identifier = toIdentifier(entry.key)
    if (!IDENTIFIER_PATTERN.test(identifier)) {
      throw new Error(
        `${manifestFile}: "${entry.key}" is a valid plugin key, but the identifier ` +
          `community.plugins.ts would bind for it, "${identifier}", is not a valid TypeScript ` +
          'identifier. Each hyphen must be followed by exactly one lower-case letter or digit, ' +
          'and a key cannot end in a hyphen.',
      )
    }

    const collidingKey = identifiers.get(identifier)
    if (collidingKey !== undefined) {
      throw new Error(
        `${manifestFile}: "${entry.key}" and "${collidingKey}" both generate the identifier ` +
          `"${identifier}" for community.plugins.ts. Rename one of the keys so the generated ` +
          'imports do not collide.',
      )
    }
    identifiers.set(identifier, entry.key)

    if (!dependencies.has(entry.package)) {
      throw new Error(
        `${manifestFile}: "${entry.package}" (key "${entry.key}") is not a dependency of ` +
          `${packageLabel}. Run \`pnpm add ${entry.package} --filter ${filterName}\` first.`,
      )
    }
  }
}

export function toIdentifier(key) {
  return key.replace(/-([a-z0-9])/g, (_match, char) => char.toUpperCase())
}

/**
 * The generated community.plugins.ts, before formatting — the caller runs
 * it through Biome so the file on disk matches what `pnpm format` would do
 * to it anyway, rather than this function trying to guess Biome's style.
 *
 * Each entry imports its package's `plugin` and `messages` exports — the
 * convention a manifest-installable package satisfies: a ready
 * `PluginDefinition` built with no arguments (its own configuration lives
 * in settings, the way MEI-74 moved plugins/dues's plans there) and its
 * message catalog, `{}` if it ships no text of its own.
 *
 * @param {readonly ManifestEntry[]} plugins
 */
export function renderPluginsModule(plugins) {
  const importLines = plugins.map((entry) => {
    const name = toIdentifier(entry.key)
    return `import { messages as ${name}Messages, plugin as ${name}Plugin } from '${entry.package}'`
  })

  const entryLines = plugins.map((entry) => {
    const name = toIdentifier(entry.key)
    const enabled = entry.enabled === false ? 'false' : 'true'
    return (
      `  { key: '${entry.key}', enabled: ${enabled}, ` +
      `plugin: ${name}Plugin, messages: ${name}Messages },`
    )
  })

  return `${HEADER}
import type { InstalledPlugin } from '@meith/core'
${importLines.length > 0 ? `${importLines.join('\n')}\n` : ''}import type { PluginDefinition } from '@meith/plugin-kit'

import { showcasePlugins } from './community.demo.plugins'

export const INSTALLED_PLUGINS: readonly InstalledPlugin<PluginDefinition>[] = [
${entryLines.length > 0 ? `${entryLines.join('\n')}\n` : ''}  ...showcasePlugins(),
]

export function installedPluginDefinitions(): readonly PluginDefinition[] {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin as PluginDefinition)
}
`
}

/**
 * Formats TypeScript source through the project's actual Biome config, on a
 * throwaway file outside the repository — never one the caller names — so
 * this never writes anything a `--check` run, or a test, did not ask for.
 * `--config-path` is explicit rather than relied on being found by walking
 * up from the temp file (which a system tmpdir is not a descendant of) or
 * from the process's own cwd (which a caller should not have to match).
 *
 * @param {string} source
 * @param {{ readonly root: string }} options root: the repository root, i.e. where biome.json lives
 */
export async function formatWithBiome(source, options) {
  const dir = await mkdtemp(join(tmpdir(), 'board-plugins-'))
  const file = join(dir, 'community.plugins.ts')
  try {
    await writeFile(file, source, 'utf8')
    execFileSync(
      join(options.root, 'node_modules/.bin/biome'),
      ['check', '--write', `--config-path=${options.root}`, file],
      { stdio: 'pipe' },
    )
    return await readFile(file, 'utf8')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
