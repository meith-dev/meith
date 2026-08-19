#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT, workspacePackages } from './workspace-packages.mjs'

const problems = []

const root = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
const version = root.version

if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `✗ release coherence: the root package.json version is "${version}", not major.minor.patch`,
  )
  process.exit(1)
}

const byName = new Map()
for (const { dir, manifest } of await workspacePackages()) {
  byName.set(manifest.name, { dir, manifest })
  if (manifest.version !== version) {
    problems.push(`${dir}/package.json is at ${manifest.version}; the release is ${version}`)
  }
}

const published = [...byName.values()].filter(({ manifest }) => manifest.private !== true)

for (const { dir, manifest } of published) {
  for (const field of ['dependencies', 'peerDependencies']) {
    for (const dep of Object.keys(manifest[field] ?? {})) {
      const target = byName.get(dep)
      if (target !== undefined && target.manifest.private === true) {
        problems.push(
          `${dir} is published and depends on ${dep}, which is private — publish it or drop the dependency`,
        )
      }
    }
  }

  if (manifest.license !== 'LGPL-3.0-or-later') {
    problems.push(`${dir} is published without the repository licence`)
  }
  if (manifest.repository?.directory !== dir) {
    problems.push(
      `${dir} is published and its repository.directory says "${manifest.repository?.directory}"`,
    )
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    problems.push(`${dir} is published without a files whitelist`)
  }
  if (manifest.publishConfig?.access !== 'public') {
    problems.push(`${dir} is published without publishConfig.access "public"`)
  }
}

const CONSTANTS = [
  { file: 'apps/cli/src/upgrade.ts', pattern: /export const CODE_VERSION = '([^']+)'/ },
  {
    file: 'apps/community/src/server/upgrade-notice.ts',
    pattern: /export const CODE_VERSION = '([^']+)'/,
  },
  {
    file: 'packages/create-meith/src/bin.ts',
    pattern: /run\(process\.argv\.slice\(2\), '([^']+)'\)/,
  },
]

const PLUGIN_MANIFESTS = [
  { file: 'plugins/dues/src/definition.tsx', pattern: /\n\s*version: '([^']+)'/ },
  { file: 'plugins/reference/src/plugin.tsx', pattern: /\n\s*version: '([^']+)'/ },
]

for (const { file, pattern } of [...CONSTANTS, ...PLUGIN_MANIFESTS]) {
  const source = await readFile(join(ROOT, file), 'utf8')
  const match = pattern.exec(source)
  if (match === null) {
    problems.push(
      `${file} no longer contains the version this check reads — update release-check.mjs with it`,
    )
  } else if (match[1] !== version) {
    problems.push(`${file} says ${match[1]}; the release is ${version}`)
  }
}

const COMPOSE_PINS = ['docker/compose.coolify.yml', 'docker/coolify-service-template.yml']

for (const file of COMPOSE_PINS) {
  const compose = await readFile(join(ROOT, file), 'utf8')
  const pins = [...compose.matchAll(/\$\{MEITH_IMAGE:-ghcr\.io\/meith-dev\/meith:([^}]+)\}/g)]

  if (pins.length === 0) {
    problems.push(`${file} no longer defaults MEITH_IMAGE to a ghcr.io/meith-dev/meith tag`)
  }
  for (const pin of pins) {
    if (pin[1] !== version) {
      problems.push(`${file} pins ghcr.io/meith-dev/meith:${pin[1]}; the release is ${version}`)
    }
  }
}

const tagIndex = process.argv.indexOf('--tag')
if (tagIndex !== -1) {
  const tag = process.argv[tagIndex + 1] ?? ''
  if (tag !== `v${version}`) {
    problems.push(
      `the tag is "${tag}" and the tree is ${version} — a release tag must be v${version}`,
    )
  }
}

if (problems.length > 0) {
  console.error('✗ release coherence:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('')
  process.exit(1)
}

console.log(
  `✓ release coherence: ${version} in the root manifest, ${byName.size} workspace manifests, ` +
    `${CONSTANTS.length} source constants, ${PLUGIN_MANIFESTS.length} plugin manifests, ` +
    `and ${COMPOSE_PINS.length} compose pins; ` +
    `${published.length} packages publish to npm and the set is closed`,
)
