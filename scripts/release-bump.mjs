#!/usr/bin/env node
// Moves the release version everywhere release-check reads it — the bump half
// of cutting a release; docs/release.md § How a release happens.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT, workspacePackages } from './workspace-packages.mjs'

const version = process.argv[2] ?? ''

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`✗ release bump: "${version}" is not a version. Pass major.minor.patch, with no leading v.`)
  process.exit(1)
}

const parse = (value) => value.split('.').map(Number)
const rootManifestPath = join(ROOT, 'package.json')
const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8'))
const current = rootManifest.version

const [a, b, c] = parse(version)
const [x, y, z] = parse(current)
if ((a - x || b - y || c - z) <= 0) {
  console.error(`✗ release bump: the tree is at ${current}, and ${version} does not move it forward.`)
  process.exit(1)
}

let manifests = 0
rootManifest.version = version
await writeFile(rootManifestPath, JSON.stringify(rootManifest, null, 2) + '\n')

for (const { dir, manifest } of await workspacePackages()) {
  manifest.version = version
  await writeFile(join(ROOT, dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  manifests += 1
}

// The same places release-check reads, moved rather than checked.
const REWRITES = [
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
    file: 'docker/compose.coolify.yml',
    pattern: /(\$\{MEITH_IMAGE:-ghcr\.io\/meith-dev\/meith:)[^}]+(\})/g,
  },
]

for (const { file, pattern } of REWRITES) {
  const path = join(ROOT, file)
  const source = await readFile(path, 'utf8')
  const rewritten = source.replace(pattern, `$1${version}$2`)
  if (rewritten === source) {
    console.error(`✗ release bump: ${file} no longer contains the version this script moves — update release-bump.mjs with it`)
    process.exit(1)
  }
  await writeFile(path, rewritten)
}

console.log(
  `✓ release bump: ${current} → ${version} in the root manifest, ${manifests} workspace manifests, ` +
    `${REWRITES.length - 1} source constants, and the compose pin. Run release-check, then commit.`,
)
