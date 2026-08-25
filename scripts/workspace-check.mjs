#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT, workspaceEntries } from './workspace-packages.mjs'

const problems = []

const byName = new Map()
const directories = []

for (const { dir, manifest } of await workspaceEntries()) {
  directories.push(dir)

  if (manifest === null) {
    try {
      await readdir(join(ROOT, dir, 'src'))
      problems.push(
        `${dir} has src/ but no package.json — pnpm will not see it as a workspace package`,
      )
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

  const dir = target.replace(/^\.\//, '').split('/').slice(0, 2).join('/')
  if (!directories.includes(dir)) {
    problems.push(
      `tsconfig.base.json maps ${alias} to ${target}, which is not a workspace directory`,
    )
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

const FRAMEWORK_PINS = ['next', 'react', 'react-dom']
const boardManifest = byName.get('@meith/web')?.manifest ?? {}
const frameworkVersions = new Map(
  FRAMEWORK_PINS.map((name) => [name, boardManifest.dependencies?.[name]]),
)

for (const [name, version] of frameworkVersions) {
  if (typeof version !== 'string') {
    problems.push(
      `apps/community/package.json no longer pins "${name}" — update workspace-check.mjs, ` +
        'which reads it as the one version every other manifest and the scaffold must agree with',
    )
  }
}

for (const { dir, manifest } of byName.values()) {
  if (manifest.name === '@meith/web') continue
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (!frameworkVersions.has(name)) continue
      const expected = frameworkVersions.get(name)
      if (range === expected) continue
      problems.push(
        `${dir}/package.json pins ${field}."${name}" at ${range}; @meith/web pins ${expected}. ` +
          "A board materializes @meith/web's own app and builds it — two versions of the " +
          'framework in one install is the resolution that produces them',
      )
    }
  }
}

const SWC_HELPERS = '@swc/helpers'
const SWC_HELPERS_TRACED_BY = ['apps/community/next.config.mjs', 'apps/web/next.config.mjs']

const swcHelpersPins = []
for (const { dir, manifest } of byName.values()) {
  for (const field of ['dependencies', 'devDependencies']) {
    const range = manifest[field]?.[SWC_HELPERS]
    if (typeof range !== 'string') continue
    swcHelpersPins.push({ dir, field, range })
  }
}

if (swcHelpersPins.length === 0) {
  problems.push(
    `no workspace package pins "${SWC_HELPERS}" — update workspace-check.mjs, which reads it ` +
      "as the version the output-tracing globs in next.config.mjs name inside pnpm's store",
  )
}

for (const file of SWC_HELPERS_TRACED_BY) {
  const source = await readFile(join(ROOT, file), 'utf8')
  const traced = new Set(
    [...source.matchAll(/@swc\+helpers@([^/\s'`]+)/g)].map((match) => match[1]),
  )

  if (traced.size === 0) {
    problems.push(
      `${file} no longer names a versioned @swc+helpers entry in pnpm's store — ` +
        'update workspace-check.mjs with it',
    )
    continue
  }

  for (const version of traced) {
    for (const { dir, field, range } of swcHelpersPins) {
      if (version === range) continue
      problems.push(
        `${file} traces @swc+helpers@${version} out of pnpm's store; ${dir}/package.json pins ` +
          `${field}."${SWC_HELPERS}" at ${range}. That glob exists because Next's output ` +
          "tracer follows only the CJS half of the package and misses the esm/ half next's " +
          'own require-hook loads; a version it no longer matches makes it a silent no-op, ' +
          'and the standalone server fails at request time with Cannot find module ' +
          `'${SWC_HELPERS}/esm/…' rather than at build time`,
      )
    }
  }
}

function stringList(source, pattern, file, label) {
  const match = pattern.exec(source)
  if (match === null) {
    problems.push(`${file} no longer declares ${label} — update workspace-check.mjs with it`)
    return null
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1])
}

const scaffoldSource = await readFile(join(ROOT, 'packages/create-meith/src/scaffold.ts'), 'utf8')
const forumWebSource = await readFile(join(ROOT, 'apps/community/bin/forum-web.mjs'), 'utf8')

const scaffoldNext = /export const NEXT_VERSION = '([^']+)'/.exec(scaffoldSource)
if (scaffoldNext === null) {
  problems.push(
    'packages/create-meith/src/scaffold.ts no longer declares NEXT_VERSION — ' +
      'update workspace-check.mjs with it',
  )
} else if (scaffoldNext[1] !== frameworkVersions.get('next')) {
  problems.push(
    `packages/create-meith/src/scaffold.ts scaffolds next@${scaffoldNext[1]}; @meith/web pins ` +
      `${frameworkVersions.get('next')}. A scaffolded board declares next only so Vercel's ` +
      'framework detection can read it out of the manifest — declaring a different one from ' +
      'the app it builds is worse than declaring none',
  )
}

const scaffoldEntries = stringList(
  scaffoldSource,
  /export const MATERIALIZED_AT_ROOT = \[([\s\S]*?)\]/,
  'packages/create-meith/src/scaffold.ts',
  'MATERIALIZED_AT_ROOT',
)
const appEntries = stringList(
  forumWebSource,
  /const APP_ENTRIES = \[([\s\S]*?)\]/,
  'apps/community/bin/forum-web.mjs',
  'APP_ENTRIES',
)
const generatedEntries = stringList(
  forumWebSource,
  /const GENERATED_ENTRIES = \[([\s\S]*?)\]/,
  'apps/community/bin/forum-web.mjs',
  'GENERATED_ENTRIES',
)

if (scaffoldEntries !== null && appEntries !== null && generatedEntries !== null) {
  const materialized = [...appEntries, ...generatedEntries]
  const missing = materialized.filter((entry) => !scaffoldEntries.includes(entry))
  const extra = scaffoldEntries.filter((entry) => !materialized.includes(entry))
  for (const entry of missing) {
    problems.push(
      `forum-web materializes "${entry}" into a board's root under --at-root and ` +
        'MATERIALIZED_AT_ROOT (packages/create-meith/src/scaffold.ts) does not list it — ' +
        "a scaffolded board's .gitignore would leave it untracked-but-not-ignored",
    )
  }
  for (const entry of extra) {
    problems.push(
      `MATERIALIZED_AT_ROOT lists "${entry}" and forum-web no longer materializes it — ` +
        "a scaffolded board's .gitignore would hide a file the board itself owns",
    )
  }
}

const publicEntries = stringList(
  scaffoldSource,
  /export const MATERIALIZED_PUBLIC = \[([\s\S]*?)\]/,
  'packages/create-meith/src/scaffold.ts',
  'MATERIALIZED_PUBLIC',
)

if (publicEntries !== null) {
  const shipped = []
  const walk = async (dir, prefix) => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? item.name : `${prefix}/${item.name}`
      if (item.isDirectory()) await walk(join(dir, item.name), rel)
      else shipped.push(rel)
    }
  }
  await walk(join(ROOT, 'apps/community/public'), '')

  const missing = shipped.filter((entry) => !publicEntries.includes(entry))
  const extra = publicEntries.filter((entry) => !shipped.includes(entry))
  for (const entry of [...missing, ...extra]) {
    problems.push(
      `MATERIALIZED_PUBLIC (packages/create-meith/src/scaffold.ts) and apps/community/public ` +
        `disagree about "${entry}". A scaffolded board gitignores public/ file by file so that ` +
        'it can keep its own files there; a name missing from that list only shows up as ' +
        'untracked noise after a build, but the list is what makes the directory shared',
    )
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
    `and matches the lockfile, every ${FRAMEWORK_PINS.join('/')} pin agrees with @meith/web, ` +
    `every @swc+helpers output-tracing glob names the pinned ${SWC_HELPERS}, ` +
    "and create-meith's scaffold ignores exactly what forum-web --at-root materializes",
)
