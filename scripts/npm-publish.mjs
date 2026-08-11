#!/usr/bin/env node
// Publish every non-private workspace package at the release version — the
// npm half of a release; docs/release.md is the narrative. Dependencies
// publish before their dependents, a version already on the registry is
// skipped rather than an error (so a partly-failed release run can be
// re-run), and --dry-run packs everything without talking to the registry.
import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const WORKSPACE_GLOBS = ['apps', 'packages', 'themes', 'plugins', 'examples']
const dryRun = process.argv.includes('--dry-run')

const packages = []
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
      continue
    }
    if (manifest.private === true) continue
    packages.push({ dir, name: manifest.name, version: manifest.version, manifest })
  }
}

if (packages.length === 0) {
  console.error('✗ npm publish: no publishable package found — every manifest is private')
  process.exit(1)
}

// Dependencies first. `release-check` has already proven the set is closed,
// so every workspace dependency of a published package is itself in the set.
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

let publishedCount = 0
let skipped = 0
for (const { dir, name, version } of ordered) {
  if (!dryRun) {
    const view = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
      cwd: join(ROOT, dir),
      encoding: 'utf8',
    })
    if (view.status === 0 && view.stdout.trim() !== '') {
      console.log(`- ${name}@${version} is already on the registry, skipping`)
      skipped += 1
      continue
    }
    if (view.status !== 0 && !`${view.stderr}`.includes('E404')) {
      console.error(`✗ npm publish: could not ask the registry about ${name}@${version}:\n${view.stderr}`)
      process.exit(1)
    }
  }

  console.log(`- publishing ${name}@${version}${dryRun ? ' (dry run)' : ''}`)
  const publish = spawnSync(
    'pnpm',
    ['publish', '--access', 'public', '--no-git-checks', ...(dryRun ? ['--dry-run'] : [])],
    { cwd: join(ROOT, dir), stdio: 'inherit' },
  )
  if (publish.status !== 0) {
    console.error(`✗ npm publish: ${name}@${version} failed; re-running this script resumes after what succeeded`)
    process.exit(1)
  }
  publishedCount += 1
}

console.log(
  `✓ npm publish: ${publishedCount} package${publishedCount === 1 ? '' : 's'} ` +
    `${dryRun ? 'packed (dry run)' : 'published'}${skipped > 0 ? `, ${skipped} already on the registry` : ''}`,
)
