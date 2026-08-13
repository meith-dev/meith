#!/usr/bin/env node
// Publish every non-private workspace package at the release version — the
// npm half of a release; docs/release.md is the narrative. Dependencies
// publish before their dependents, a version already on the registry is
// skipped rather than an error (so a partly-failed release run can be
// re-run), and --dry-run packs everything without talking to the registry.
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
let bootstrapped = 0
for (const { dir, name, version } of ordered) {
  // A package the registry has never seen cannot be created by trusted
  // publishing, so its first publish uses the bootstrap token instead —
  // docs/release.md § How the workflow authenticates.
  let isNew = false
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

    const pkg = spawnSync('npm', ['view', name, 'name'], { encoding: 'utf8' })
    isNew = pkg.status !== 0 && `${pkg.stderr}`.includes('E404')
    if (isNew && (process.env.NPM_BOOTSTRAP_TOKEN ?? '') === '') {
      console.error(
        `✗ npm publish: ${name} is new to the registry, and trusted publishing cannot create it.\n` +
          `  Either set the NPM_BOOTSTRAP_TOKEN secret — a granular token allowed to create\n` +
          `  packages in the scope — and re-run, or publish ${name}@${version} once by hand\n` +
          `  and re-run. Afterwards, give the package its trusted publisher on npmjs.com.`,
      )
      process.exit(1)
    }
  }

  console.log(`- publishing ${name}@${version}${dryRun ? ' (dry run)' : ''}`)

  // pnpm packs (rewriting workspace: ranges); npm publishes (it implements
  // trusted publishing) — docs/release.md § What publishes to npm.
  const tarball = join(tmpdir(), `${name.replace('/', '-').replace('@', '')}-${version}.tgz`)
  const pack = spawnSync('pnpm', ['pack', '--out', tarball], {
    cwd: join(ROOT, dir),
    stdio: 'inherit',
  })
  if (pack.status !== 0) {
    console.error(`✗ npm publish: packing ${name}@${version} failed`)
    process.exit(1)
  }

  // The token is confined to a scratch project directory that only the
  // bootstrap publish runs from; every other publish sees no credentials
  // and authenticates by OIDC.
  let cwd = join(ROOT, dir)
  if (isNew) {
    cwd = await mkdtemp(join(tmpdir(), 'meith-bootstrap-'))
    await writeFile(join(cwd, '.npmrc'), '//registry.npmjs.org/:_authToken=${NPM_BOOTSTRAP_TOKEN}\n')
    console.log(`- ${name} is new to the registry; bootstrapping with the token`)
  }

  const publish = spawnSync(
    'npm',
    ['publish', tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])],
    { cwd, stdio: 'inherit' },
  )
  await rm(tarball, { force: true })
  if (isNew) await rm(cwd, { recursive: true, force: true })
  if (publish.status !== 0) {
    console.error(`✗ npm publish: ${name}@${version} failed; re-running this script resumes after what succeeded`)
    process.exit(1)
  }
  publishedCount += 1
  if (isNew) bootstrapped += 1
}

console.log(
  `✓ npm publish: ${publishedCount} package${publishedCount === 1 ? '' : 's'} ` +
    `${dryRun ? 'packed (dry run)' : 'published'}${skipped > 0 ? `, ${skipped} already on the registry` : ''}`,
)
if (bootstrapped > 0) {
  console.log(
    `! ${bootstrapped} package${bootstrapped === 1 ? ' was' : 's were'} created with the bootstrap token. ` +
      'Give each its trusted publisher on npmjs.com before the next release — ' +
      'docs/release.md § How the workflow authenticates.',
  )
}
