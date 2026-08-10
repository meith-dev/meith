#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const WORKSPACE_GLOBS = ['apps', 'packages', 'themes', 'plugins', 'examples']

const problems = []

const byName = new Map()
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
      try {
        await readdir(join(ROOT, dir, 'src'))
        problems.push(`${dir} has src/ but no package.json — pnpm will not see it as a workspace package`)
      } catch {
        /* ignore */
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
