#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  pluginDefinitionSites,
  ROOT,
  themeDefinitionSites,
  workspacePackages,
} from './workspace-packages.mjs'

const version = process.argv[2] ?? ''

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `✗ release bump: "${version}" is not a version. Pass major.minor.patch, with no leading v.`,
  )
  process.exit(1)
}

const parse = (value) => value.split('.').map(Number)
const rootManifestPath = join(ROOT, 'package.json')
const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8'))
const current = rootManifest.version

const [a, b, c] = parse(version)
const [x, y, z] = parse(current)
if ((a - x || b - y || c - z) <= 0) {
  console.error(
    `✗ release bump: the tree is at ${current}, and ${version} does not move it forward.`,
  )
  process.exit(1)
}

let manifests = 0
rootManifest.version = version
await writeFile(rootManifestPath, JSON.stringify(rootManifest, null, 2) + '\n')

const workspaceNames = new Set()
for (const { dir, manifest } of await workspacePackages()) {
  workspaceNames.add(manifest.name)
  manifest.version = version
  await writeFile(join(ROOT, dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  manifests += 1
}

const LISTINGS_DIR = 'marketplace/listings'
const listingsDirAbs = join(ROOT, LISTINGS_DIR)
const listingNames = (await readdir(listingsDirAbs)).filter((name) => name.endsWith('.json')).sort()
const LISTING_VERSION_FIELD = /("version":\s*")[^"]+(")/

let listings = 0
for (const name of listingNames) {
  const path = join(listingsDirAbs, name)
  const source = await readFile(path, 'utf8')
  const listing = JSON.parse(source)
  if (!workspaceNames.has(listing.package)) continue
  await writeFile(path, source.replace(LISTING_VERSION_FIELD, `$1${version}$2`))
  listings += 1
}

const SOURCE_CONSTANTS = [
  {
    file: 'apps/cli/src/upgrade.ts',
    pattern: /(export const CODE_VERSION = ')[^']+(')/,
  },
  {
    file: 'apps/community/src/server/upgrade-notice.ts',
    pattern: /(export const CODE_VERSION = ')[^']+(')/,
  },
  {
    file: 'packages/create-meith/src/bin.ts',
    pattern: /(run\(process\.argv\.slice\(2\), ')[^']+('\))/,
  },
  {
    file: 'packages/marketplace/src/build-info.ts',
    pattern: /(export const MEITH_VERSION = ')[^']+(')/,
  },
]

const PLUGIN_MANIFESTS = (await pluginDefinitionSites()).map((file) => ({
  file,
  pattern: /(\n\s*version: ')[^']+(')/,
}))

const THEME_MANIFESTS = (await themeDefinitionSites()).map((file) => ({
  file,
  pattern: /(\n\s*version: ')[^']+(')/,
}))

const COMPOSE_PIN = {
  file: 'docker/compose.coolify.yml',
  pattern: /(\$\{MEITH_IMAGE:-ghcr\.io\/meith-dev\/meith:)[^}]+(\})/g,
}

const REWRITES = [...SOURCE_CONSTANTS, ...PLUGIN_MANIFESTS, ...THEME_MANIFESTS, COMPOSE_PIN]

for (const { file, pattern } of REWRITES) {
  const path = join(ROOT, file)
  const source = await readFile(path, 'utf8')
  const rewritten = source.replace(pattern, `$1${version}$2`)
  if (rewritten === source) {
    console.error(
      `✗ release bump: ${file} no longer contains the version this script moves — update release-bump.mjs with it`,
    )
    process.exit(1)
  }
  await writeFile(path, rewritten)
}

execFileSync('pnpm', ['api:docs'], { cwd: ROOT, stdio: 'inherit' })
execFileSync('pnpm', ['board-installer:gen'], { cwd: ROOT, stdio: 'inherit' })
execFileSync('pnpm', ['templates:gen'], { cwd: ROOT, stdio: 'inherit' })
execFileSync('pnpm', ['marketplace:gen'], { cwd: ROOT, stdio: 'inherit' })

console.log(
  `✓ release bump: ${current} → ${version} in the root manifest, ${manifests} workspace manifests, ` +
    `${SOURCE_CONSTANTS.length} source constants, ${PLUGIN_MANIFESTS.length} plugin manifests, ` +
    `${THEME_MANIFESTS.length} theme manifests, ` +
    `the compose pin, ${listings} first-party marketplace listings and the regenerated feed, ` +
    'the generated OpenAPI document, the generated board installer script, and the ' +
    'generated deploy templates. ' +
    'Run release-check, then commit.',
)
