#!/usr/bin/env node
// Publish every non-private workspace package at the release version — the
// npm half of a release; docs/release.md is the narrative. Dependencies
// publish before their dependents, a version already on the registry is
// skipped rather than an error (so a partly-failed release run can be
// re-run), and --dry-run packs everything without talking to the registry.
//
// One package that will not publish does not take the rest of the release
// with it. v0.3.1 and v0.3.2 both stopped at the first name the registry had
// never seen, and the three themes ordered behind it were never attempted —
// they sat two releases behind on npm while everything around them moved. So
// a refusal is recorded and the run carries on, skipping only the packages
// that depend on what failed, and the summary at the end names everything
// that did not go out and why.
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ROOT, workspacePackages } from './workspace-packages.mjs'

const dryRun = process.argv.includes('--dry-run')
const REGISTRY = 'https://registry.npmjs.org/'
const bootstrapToken = process.env.NPM_BOOTSTRAP_TOKEN ?? ''

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

const indent = (text) =>
  `${text}`
    .trimEnd()
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')

// The two ways out of a bootstrap that cannot happen, named wherever one is
// reported: publishing by hand packs with pnpm too, because a manifest still
// carrying `workspace:^` ranges is an install that resolves for nobody.
const byHand = (dir, name, version) =>
  `cd ${dir} && pnpm pack --out /tmp/pack.tgz && npm publish /tmp/pack.tgz --access public` +
  `\n  (${name}@${version}; \`npm login\` first, so the publish carries 2FA)`

// ── what the registry already knows ──────────────────────────────────────
// Asked for the whole set before anything is packed. It decides which
// packages need the bootstrap token, and a release that is going to need one
// should say so at the top of its log rather than five publishes in.
const state = new Map()
const failures = []
const failed = new Set()

const fail = (name, why) => {
  failures.push({ name, why })
  failed.add(name)
}

for (const { dir, name, version } of ordered) {
  if (dryRun) {
    state.set(name, 'known')
    continue
  }

  const view = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    cwd: join(ROOT, dir),
    encoding: 'utf8',
  })
  if (view.status === 0 && view.stdout.trim() !== '') {
    state.set(name, 'published')
    continue
  }
  if (view.status !== 0 && !`${view.stderr}`.includes('E404')) {
    fail(name, `the registry could not be asked about it:\n${indent(view.stderr)}`)
    continue
  }

  // A package the registry has never seen cannot be created by trusted
  // publishing, so its first publish uses the bootstrap token instead —
  // docs/release.md § How the workflow authenticates.
  const pkg = spawnSync('npm', ['view', name, 'name'], { encoding: 'utf8' })
  const isNew = pkg.status !== 0 && `${pkg.stderr}`.includes('E404')
  state.set(name, isNew ? 'new' : 'known')

  if (isNew) {
    console.log(
      `- ${name} is new to the registry; its first publish needs NPM_BOOTSTRAP_TOKEN`,
    )
    if (bootstrapToken === '') {
      fail(
        name,
        'it is new to the registry, NPM_BOOTSTRAP_TOKEN is not set, and trusted publishing\n' +
          '  cannot create a package. Either set the secret — a granular token allowed to\n' +
          '  create packages in the scope — and re-run, or publish it once by hand:\n' +
          `  ${byHand(dir, name, version)}\n` +
          '  Afterwards, give the package its trusted publisher on npmjs.com.',
      )
    }
  }
}

let publishedCount = 0
let skipped = 0
let bootstrapped = 0
const blocked = new Map()

for (const { dir, name, version, manifest } of ordered) {
  if (state.get(name) === 'published') {
    console.log(`- ${name}@${version} is already on the registry, skipping`)
    skipped += 1
    continue
  }
  if (failed.has(name)) continue

  // Ordered dependencies-first, so anything this package needs has had its
  // turn by now. Publishing over a missing dependency would put a manifest on
  // the registry whose `^X.Y.Z` range resolves to nothing, which is a worse
  // outcome than not publishing it at all.
  const missing = Object.keys(manifest.dependencies ?? {}).find(
    (dep) => names.has(dep) && failed.has(dep),
  )
  if (missing) {
    blocked.set(name, missing)
    failed.add(name)
    continue
  }

  const isNew = state.get(name) === 'new'
  console.log(`- publishing ${name}@${version}${dryRun ? ' (dry run)' : ''}`)

  // pnpm packs (rewriting workspace: ranges); npm publishes (it implements
  // trusted publishing) — docs/release.md § What publishes to npm.
  const tarball = join(tmpdir(), `${name.replace('/', '-').replace('@', '')}-${version}.tgz`)
  const pack = spawnSync('pnpm', ['pack', '--out', tarball], {
    cwd: join(ROOT, dir),
    stdio: 'inherit',
  })
  if (pack.status !== 0) {
    fail(name, 'packing it failed; the publish was never attempted')
    continue
  }

  // The token is confined to a scratch project directory that only the
  // bootstrap publish runs from; every other publish sees no credentials
  // and authenticates by OIDC.
  let cwd = join(ROOT, dir)
  if (isNew) {
    cwd = await mkdtemp(join(tmpdir(), 'meith-bootstrap-'))
    await writeFile(join(cwd, '.npmrc'), '//registry.npmjs.org/:_authToken=${NPM_BOOTSTRAP_TOKEN}\n')
    console.log('  authenticating this one with the bootstrap token, not OIDC')
  }

  const publish = spawnSync(
    'npm',
    ['publish', tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])],
    { cwd, stdio: 'inherit' },
  )

  // Asked before the scratch directory goes away, and only when it matters:
  // npm answers 404 both for "no such package" and for "this credential may
  // not create it", and whether the token identifies anyone at all is what
  // separates an expired token from one whose reach is too narrow.
  let identity = null
  if (isNew && publish.status !== 0) {
    const who = spawnSync('npm', ['whoami', '--registry', REGISTRY], { cwd, encoding: 'utf8' })
    identity = who.status === 0 ? who.stdout.trim() : null
  }

  await rm(tarball, { force: true })
  if (isNew) await rm(cwd, { recursive: true, force: true })

  if (publish.status !== 0) {
    fail(
      name,
      isNew
        ? 'the bootstrap publish was refused with npm above. That 404 covers "this\n' +
            '  credential may not create the package" as well as "no such package", so it is\n' +
            '  nearly always NPM_BOOTSTRAP_TOKEN rather than the tarball.\n' +
            (identity === null
              ? '  The token identified nobody to the registry — it is expired, revoked or malformed.\n'
              : `  The token authenticates as ${identity}, so its reach is the thing to check, not its validity.\n`) +
            '  A bootstrap needs a token that is, on npmjs.com:\n' +
            '    - granular — classic tokens no longer publish;\n' +
            '    - unexpired;\n' +
            '    - owned by someone who may create packages in the organisation;\n' +
            '    - scoped under "Packages and scopes" to the whole scope, read and write.\n' +
            '      A token limited to selected packages cannot create a name that does not\n' +
            '      exist yet, which is exactly what a first publish is.\n' +
            '  Or publish it once by hand and re-run — only a first publish takes this path:\n' +
            `  ${byHand(dir, name, version)}`
        : 'npm publish refused it — the error is above. A package that already exists\n' +
            '  publishes by trusted publishing, so the usual cause is its trusted publisher\n' +
            '  on npmjs.com naming a different repository or workflow file than this one.',
    )
    continue
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

if (failures.length > 0) {
  const missed = failures.length + blocked.size
  console.error(
    `\n✗ npm publish: ${missed} package${missed === 1 ? '' : 's'} did not publish. ` +
      'Everything else went out; re-running this script resumes after what succeeded.',
  )
  for (const { name, why } of failures) console.error(`\n  ${name}: ${why}`)
  for (const [name, dep] of blocked) {
    console.error(`\n  ${name}: held back — it depends on ${dep}, which did not publish.`)
  }
  process.exit(1)
}
