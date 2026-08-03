#!/usr/bin/env node
/**
 * Workspace integrity.
 *
 * Every gate this project runs — typecheck, lint, dependency-cruiser, the test
 * suite, even `next build` — resolves `@forum/*` through the tsconfig path
 * aliases, which point straight at `src/index.ts`. **None of them needs a
 * package.json.** So a package directory with no manifest passes the entire
 * verify pipeline and then fails on the next clean `pnpm install`, which is CI
 * and every new checkout.
 *
 * That is not hypothetical: it happened. `packages/admin` was created without
 * its manifest (a `cat >` that ran from the wrong directory), and 2,457 tests,
 * two typechecks, dependency-cruiser and a production build all passed while
 * `pnpm install --frozen-lockfile` would have failed.
 *
 * This check closes it, and deliberately does *not* shell out to pnpm: it has
 * to be fast enough to run in `verify` on every change.
 *
 * Run: pnpm workspace:check
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const WORKSPACE_GLOBS = ['apps', 'packages', 'themes', 'plugins']

const problems = []

/** Every workspace package, by declared name. */
const byName = new Map()
/** Every workspace directory, so a missing manifest is visible as an absence. */
const directories = []

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
    directories.push(dir)

    let manifest
    try {
      manifest = JSON.parse(await readFile(join(ROOT, dir, 'package.json'), 'utf8'))
    } catch {
      /*
       * A directory with sources but no manifest is the failure this exists
       * for. One with neither is somebody's scratch directory and not our
       * business — so the check is "has src/, lacks package.json".
       */
      try {
        await readdir(join(ROOT, dir, 'src'))
        problems.push(`${dir} has src/ but no package.json — pnpm will not see it as a workspace package`)
      } catch {
        /* No src either. Not a package. */
      }
      continue
    }

    if (typeof manifest.name !== 'string' || manifest.name === '') {
      problems.push(`${dir}/package.json has no name`)
      continue
    }

    byName.set(manifest.name, { dir, manifest })
  }
}

/* Every `workspace:` dependency must name a package that actually exists. */
for (const [name, { dir, manifest }] of byName) {
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      if (typeof range !== 'string' || !range.startsWith('workspace:')) continue
      if (!byName.has(dep)) {
        problems.push(
          `${dir}/package.json depends on "${dep}" (${range}) but no workspace package declares that name`,
        )
      }
    }
  }
  void name
}

/* Every tsconfig alias must point at a file inside a real workspace package. */
const base = JSON.parse(await readFile(join(ROOT, 'tsconfig.base.json'), 'utf8'))
for (const [alias, targets] of Object.entries(base.compilerOptions?.paths ?? {})) {
  if (!alias.startsWith('@forum/') || alias.endsWith('/*')) continue
  const target = targets[0]
  if (typeof target !== 'string') continue

  const dir = target.split('/').slice(0, 2).join('/')
  if (!directories.includes(dir)) {
    problems.push(`tsconfig.base.json maps ${alias} to ${target}, which is not a workspace directory`)
    continue
  }
  if (![...byName.values()].some((entry) => entry.dir === dir)) {
    problems.push(`tsconfig.base.json maps ${alias} to ${dir}, which has no package.json`)
  }
}

if (problems.length > 0) {
  console.error('✗ workspace integrity:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('')
  process.exit(1)
}

console.log(`✓ workspace integrity: ${byName.size} packages, every workspace: dependency resolves`)
