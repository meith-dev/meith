#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ROOT, workspacePackages } from './workspace-packages.mjs'

export const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies']

export function workspaceDependencyNames(manifest) {
  return DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {}))
}

export function orderByDependency(packages) {
  const names = new Set(packages.map((entry) => entry.name))
  const ordered = []
  const remaining = new Map(packages.map((entry) => [entry.name, entry]))

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((entry) =>
        workspaceDependencyNames(entry.manifest).every(
          (dep) => !names.has(dep) || !remaining.has(dep),
        ),
      )
      .sort((a, b) => (a.name < b.name ? -1 : 1))
    if (ready.length === 0) {
      throw new Error(`dependency cycle among ${[...remaining.keys()].sort().join(', ')}`)
    }
    const next = ready[0]
    remaining.delete(next.name)
    ordered.push(next)
  }

  return ordered
}

export function heldBackDependency(manifest, names, staysAbsent) {
  return workspaceDependencyNames(manifest).find((dep) => names.has(dep) && staysAbsent.has(dep))
}

export function requiredTarballPrefixes(manifest) {
  const files = Array.isArray(manifest.files) ? manifest.files : []
  const prefixes = new Set()
  for (const entry of files) {
    if (entry.startsWith('!')) continue
    prefixes.add(entry.split('/')[0])
  }
  return [...prefixes].sort()
}

export function binTargets(manifest) {
  return Object.values(manifest.bin ?? {}).map((target) => target.replace(/^\.\//, ''))
}

export function missingTarballContents(manifest, tarballEntries) {
  const problems = []
  const set = new Set(tarballEntries)

  for (const prefix of requiredTarballPrefixes(manifest)) {
    const present = tarballEntries.some(
      (entry) => entry === prefix || entry.startsWith(`${prefix}/`),
    )
    if (!present) {
      problems.push(`"${prefix}" is in the files allowlist, but nothing under it is in the tarball`)
    }
  }

  for (const target of binTargets(manifest)) {
    if (!set.has(target)) {
      problems.push(`the bin target "${target}" is not a file in the tarball`)
    }
  }

  return problems
}

export function tarballEntriesFrom(tarballPath) {
  const list = spawnSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' })
  if (list.status !== 0) {
    throw new Error(`tar -tzf ${tarballPath} failed:\n${list.stderr}`)
  }
  return list.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.endsWith('/'))
    .map((line) => line.replace(/^package\//, ''))
}

const indent = (text) =>
  `${text}`
    .trimEnd()
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const packages = (await workspacePackages())
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ dir, manifest }) => ({ dir, name: manifest.name, version: manifest.version, manifest }))

  if (packages.length === 0) {
    console.error('✗ npm publish: no publishable package found — every manifest is private')
    process.exit(1)
  }

  const names = new Set(packages.map((entry) => entry.name))
  let ordered
  try {
    ordered = orderByDependency(packages)
  } catch (error) {
    console.error(`✗ npm publish: ${error.message}`)
    process.exit(1)
  }

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

    const missing = heldBackDependency(manifest, names, staysAbsent)
    if (missing) {
      heldBack.set(name, missing)
      staysAbsent.add(name)
      continue
    }

    console.log(`- packing ${name}@${version}${dryRun ? ' (dry run)' : ''}`)

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

    let tarballProblems
    try {
      tarballProblems = missingTarballContents(manifest, tarballEntriesFrom(tarball))
    } catch (error) {
      failures.push({ name, why: `reading the packed tarball failed: ${error.message}` })
      staysAbsent.add(name)
      await rm(tarball, { force: true })
      continue
    }
    if (tarballProblems.length > 0) {
      failures.push({
        name,
        why: `the packed tarball does not match its manifest:\n${indent(tarballProblems.join('\n'))}`,
      })
      staysAbsent.add(name)
      await rm(tarball, { force: true })
      continue
    }
    console.log(`  ✓ tarball contents match ${name}'s files allowlist and bin targets`)

    console.log(`- ${dryRun ? 'would publish' : 'publishing'} ${name}@${version}`)

    if (dryRun) {
      await rm(tarball, { force: true })
      published += 1
      continue
    }

    const publish = spawnSync('npm', ['publish', tarball, '--access', 'public'], {
      cwd: join(ROOT, dir),
      stdio: 'inherit',
    })
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
        "  Publish by hand and add the trusted publisher — docs/contributing/release.md § A package's first publish — " +
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
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
