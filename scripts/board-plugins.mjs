#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const PLUGIN_KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

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
