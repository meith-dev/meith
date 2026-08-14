#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ROOT, workspacePackages } from './workspace-packages.mjs'

const dryRun = process.argv.includes('--dry-run')

const packages = (await workspacePackages())
  .filter(({ manifest }) => manifest.private !== true)
  .map(({ dir, manifest }) => ({ dir, name: manifest.name, version: manifest.version, manifest }))

if (packages.length === 0) {
  console.error('✗ npm publish: no publishable package found — every manifest is private')
  process.exit(1)
}

const names = new Set(packages.map((entry) => entry.name))
const ordered = []
const remaining = new Map(packages.map((entry) => [entry.name, entry]))
while (remaining.size > 0) {
  const ready = [...remaining.values()]
    .filter((entry) =>
      Object.keys(entry.manifest.dependencies ?? {}).every(
        (dep) => !names.has(dep) || !remaining.has(dep),
      ),
    )
    .sort((a, b) => (a.name < b.name ? -1 : 1))
  if (ready.length === 0) {
    console.error(`✗ npm publish: dependency cycle among ${[...remaining.keys()].sort().join(', ')}`)
    process.exit(1)
  }
  const next = ready[0]
  remaining.delete(next.name)
  ordered.push(next)
}

const indent = (text) =>
  `${text}`
    .trimEnd()
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')

const onRegistry = new Map()
const newToRegistry = []
const failures = []
const heldBack = new Map()
const staysAbsent = new Set()

for (const { dir, name, version } of ordered) {
  if (dryRun) {
    onRegistry.set(name, 'publishable')
    continue
  }

  const atVersion = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    cwd: join(ROOT, dir),
    encoding: 'utf8',
  })
  if (atVersion.status === 0 && atVersion.stdout.trim() !== '') {
    onRegistry.set(name, 'published')
    continue
  }
  if (atVersion.status !== 0 && !`${atVersion.stderr}`.includes('E404')) {
    failures.push({
      name,
      why: `the registry could not be asked about it:\n${indent(atVersion.stderr)}`,
    })
    staysAbsent.add(name)
    continue
  }

  const byName = spawnSync('npm', ['view', name, 'name'], { encoding: 'utf8' })
  if (byName.status !== 0 && `${byName.stderr}`.includes('E404')) {
    onRegistry.set(name, 'new')
    newToRegistry.push({ dir, name, version })
    staysAbsent.add(name)
    continue
  }
  onRegistry.set(name, 'publishable')
}

let published = 0
let alreadyThere = 0

for (const { dir, name, version, manifest } of ordered) {
  if (onRegistry.get(name) === 'published') {
    console.log(`- ${name}@${version} is already on the registry, skipping`)
    alreadyThere += 1
    continue
  }
  if (onRegistry.get(name) === 'new') {
    console.log(`- ${name} is new to the registry, skipping — a first publish is made by hand`)
    continue
  }
  if (staysAbsent.has(name)) continue

  const missing = Object.keys(manifest.dependencies ?? {}).find(
    (dep) => names.has(dep) && staysAbsent.has(dep),
  )
  if (missing) {
    heldBack.set(name, missing)
    staysAbsent.add(name)
    continue
  }

  console.log(`- publishing ${name}@${version}${dryRun ? ' (dry run)' : ''}`)

  const tarball = join(tmpdir(), `${name.replace('/', '-').replace('@', '')}-${version}.tgz`)
  const pack = spawnSync('pnpm', ['pack', '--out', tarball], {
    cwd: join(ROOT, dir),
    stdio: 'inherit',
  })
  if (pack.status !== 0) {
    failures.push({ name, why: 'packing it failed; the publish was never attempted' })
    staysAbsent.add(name)
    continue
  }

  const publish = spawnSync(
    'npm',
    ['publish', tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])],
    { cwd: join(ROOT, dir), stdio: 'inherit' },
  )
  await rm(tarball, { force: true })

  if (publish.status !== 0) {
    failures.push({
      name,
      why:
        'npm publish refused it — the error is above. A package that already exists publishes\n' +
        '  by trusted publishing, so the usual cause is its trusted publisher on npmjs.com\n' +
        '  naming a different repository or workflow file than this one.',
    })
    staysAbsent.add(name)
    continue
  }
  published += 1
}

console.log(
  `✓ npm publish: ${published} package${published === 1 ? '' : 's'} ` +
    `${dryRun ? 'packed (dry run)' : 'published'}${alreadyThere > 0 ? `, ${alreadyThere} already on the registry` : ''}`,
)

if (newToRegistry.length > 0) {
  const list = newToRegistry.map((entry) => `${entry.name}@${entry.version}`).join(', ')
  console.log(
    `\n! the registry has never seen ${list}, so ${newToRegistry.length === 1 ? 'it was' : 'they were'} skipped: ` +
      'trusted publishing cannot create a package, and this workflow holds no token that could.\n' +
      "  Publish by hand and add the trusted publisher — docs/release.md § A package's first publish — " +
      'then re-run this workflow against the tag.',
  )
}

for (const [name, dep] of heldBack) {
  console.log(`! ${name} was held back: it depends on ${dep}, which is not on the registry.`)
}

if (failures.length > 0) {
  console.error(
    `\n✗ npm publish: ${failures.length} package${failures.length === 1 ? '' : 's'} did not publish. ` +
      'Everything else went out; re-running this script resumes after what succeeded.',
  )
  for (const { name, why } of failures) console.error(`\n  ${name}: ${why}`)
  process.exit(1)
}
