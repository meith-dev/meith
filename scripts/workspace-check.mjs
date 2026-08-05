#!/usr/bin/env node
/**
 * Workspace integrity.
 *
 * Every gate this project runs — typecheck, lint, dependency-cruiser, the test
 * suite, even `next build` — resolves `@meith/*` through the tsconfig path
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
 * ## The same failure, one level deeper
 *
 * It happened again, and the second time the manifest was there. A dependency
 * was added to `packages/threads/package.json` and `pnpm-lock.yaml` was never
 * regenerated — so every gate passed locally (they all resolve through the
 * tsconfig aliases and never read a lockfile) and **all five CI jobs failed at
 * the install step**, before a single check ran, because CI installs with
 * `--frozen-lockfile`.
 *
 * So the lockfile's view of each package's dependencies is compared with the
 * manifest's here. It is the same class of bug as the missing manifest and it
 * belongs in the same script: a fact about the workspace that nothing else
 * reads, and that CI reads first.
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
  if (!alias.startsWith('@meith/') || alias.endsWith('/*')) continue
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

/*
 * The lockfile's `importers` section, as `dir → field → Set(specifier names)`.
 *
 * Hand-parsed rather than through a YAML dependency, for the reason at the top
 * of this file: this runs on every change and must stay instant, and pnpm's
 * output here is machine-written and rigidly indented — two spaces per level,
 * one key per line. Anything it cannot parse is reported rather than assumed
 * fine, so a lockfile format change fails loudly instead of silently disabling
 * the check.
 */
function lockfileImporters(text) {
  const lines = text.split('\n')
  const start = lines.indexOf('importers:')
  if (start === -1) return null

  const importers = new Map()
  let dir = null
  let field = null

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    /* A column-0 key ends the section. */
    if (!line.startsWith(' ')) break

    const twoSpace = /^ {2}([^\s].*?):(?: \{\})?$/.exec(line)
    if (twoSpace !== null) {
      dir = twoSpace[1].replace(/^'|'$/g, '')
      importers.set(dir, new Map())
      field = null
      continue
    }
    if (dir === null) continue

    const fourSpace = /^ {4}(dependencies|devDependencies|optionalDependencies):$/.exec(line)
    if (fourSpace !== null) {
      field = fourSpace[1]
      importers.get(dir).set(field, new Set())
      continue
    }

    const sixSpace = /^ {6}([^\s].*?):$/.exec(line)
    if (sixSpace !== null && field !== null) {
      importers.get(dir).get(field).add(sixSpace[1].replace(/^'|'$/g, ''))
    }
  }

  return importers
}

const lockfile = lockfileImporters(await readFile(join(ROOT, 'pnpm-lock.yaml'), 'utf8'))

if (lockfile === null) {
  problems.push('pnpm-lock.yaml has no importers section — this check cannot read it')
} else {
  for (const { dir, manifest } of byName.values()) {
    const entry = lockfile.get(dir)
    if (entry === undefined) {
      problems.push(
        `${dir} is a workspace package with no entry in pnpm-lock.yaml — run \`pnpm install\``,
      )
      continue
    }

    for (const field of ['dependencies', 'devDependencies']) {
      const declared = Object.keys(manifest[field] ?? {})
      const locked = entry.get(field) ?? new Set()

      for (const name of declared) {
        if (!locked.has(name)) {
          problems.push(
            `${dir}/package.json declares ${field}."${name}" and pnpm-lock.yaml does not — ` +
              'run `pnpm install` and commit the lockfile, or CI fails at install with ' +
              'ERR_PNPM_OUTDATED_LOCKFILE before any check runs',
          )
        }
      }

      /*
       * The other direction, which is a *removed* dependency nobody re-locked.
       *
       * pnpm records an auto-installed **peer** under the importer's
       * `dependencies`, so `@meith/ui` is locked with `react` while its
       * manifest declares it a peer. Folding peers in here is what makes this
       * direction usable at all — without it the check reports eight packages
       * that are perfectly in sync, which is how a check gets switched off.
       */
      const permitted =
        field === 'dependencies'
          ? new Set([...declared, ...Object.keys(manifest.peerDependencies ?? {})])
          : new Set(declared)

      for (const name of locked) {
        if (!permitted.has(name)) {
          problems.push(
            `pnpm-lock.yaml lists ${field}."${name}" for ${dir} and its package.json does not — ` +
              'run `pnpm install` and commit the lockfile',
          )
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error('✗ workspace integrity:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('')
  process.exit(1)
}

console.log(
  `✓ workspace integrity: ${byName.size} packages, every workspace: dependency resolves ` +
    'and matches the lockfile',
)
