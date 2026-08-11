#!/usr/bin/env node
// One version, everywhere it is written down — the lockstep rule docs/release.md
// describes. With --tag vX.Y.Z (the release workflow passes it), also asserts
// the tag being released matches the version the tree carries.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const WORKSPACE_GLOBS = ['apps', 'packages', 'themes', 'plugins', 'examples']

const problems = []

const root = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
const version = root.version

if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`✗ release coherence: the root package.json version is "${version}", not major.minor.patch`)
  process.exit(1)
}

let manifests = 0
for (const glob of WORKSPACE_GLOBS) {
  let entries
  try {
    entries = await readdir(join(ROOT, glob), { withFileTypes: true })
  } catch {
    continue
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const dir = `${glob}/${entry.name}`
    let manifest
    try {
      manifest = JSON.parse(await readFile(join(ROOT, dir, 'package.json'), 'utf8'))
    } catch {
      continue // workspace-check owns "directory with no manifest"
    }

    manifests += 1
    if (manifest.version !== version) {
      problems.push(`${dir}/package.json is at ${manifest.version}; the release is ${version}`)
    }
  }
}

// The version the code states about itself.
const CONSTANTS = [
  { file: 'apps/cli/src/upgrade.ts', pattern: /export const CODE_VERSION = '([^']+)'/ },
  { file: 'apps/community/src/server/upgrade-notice.ts', pattern: /export const CODE_VERSION = '([^']+)'/ },
  // The version create-meith writes into a scaffolded project's dependencies.
  { file: 'packages/create-meith/src/bin.ts', pattern: /run\(process\.argv\.slice\(2\), '([^']+)'\)/ },
]

for (const { file, pattern } of CONSTANTS) {
  const source = await readFile(join(ROOT, file), 'utf8')
  const match = pattern.exec(source)
  if (match === null) {
    problems.push(`${file} no longer contains the version this check reads — update release-check.mjs with it`)
  } else if (match[1] !== version) {
    problems.push(`${file} says ${match[1]}; the release is ${version}`)
  }
}

// The Coolify compose file pins the release line — major.minor — once per
// service, and every pin must agree.
const [major, minor] = version.split('.')
const line = `${major}.${minor}`
const compose = await readFile(join(ROOT, 'docker-compose.coolify.yml'), 'utf8')
const pins = [...compose.matchAll(/\$\{MEITH_IMAGE:-ghcr\.io\/meith-dev\/meith:([^}]+)\}/g)]

if (pins.length === 0) {
  problems.push('docker-compose.coolify.yml no longer defaults MEITH_IMAGE to a ghcr.io/meith-dev/meith tag')
}
for (const pin of pins) {
  if (pin[1] !== line) {
    problems.push(`docker-compose.coolify.yml pins ghcr.io/meith-dev/meith:${pin[1]}; the release line is ${line}`)
  }
}

const tagIndex = process.argv.indexOf('--tag')
if (tagIndex !== -1) {
  const tag = process.argv[tagIndex + 1] ?? ''
  if (tag !== `v${version}`) {
    problems.push(`the tag is "${tag}" and the tree is ${version} — a release tag must be v${version}`)
  }
}

if (problems.length > 0) {
  console.error('✗ release coherence:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('')
  process.exit(1)
}

console.log(
  `✓ release coherence: ${version} in the root manifest, ${manifests} workspace manifests, ` +
    `${CONSTANTS.length} source constants, and the compose pin on the ${line} line`,
)
