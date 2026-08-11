#!/usr/bin/env node
// The repository root is an interface, and this is its registry: every entry
// that may live there, with the reason it must. A new root file either has a
// contract that pins it to the root (a tool that only looks there, a path
// operators already depend on) — name it here with that reason — or it
// belongs in a folder. Gitignored files (a developer's .env, build output)
// are exempt: this check is about what the repository ships.
import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const ALLOWED = new Map([
  // Directories.
  ['.git', 'the repository itself'],
  ['.github', 'GitHub reads workflows and community files from this path only'],
  ['apps', 'workspace'],
  ['docker', 'the deployment interface: the compose files, Dockerfiles, entrypoint and healthcheck'],
  ['docs', 'the documentation set — docs/README.md is its index'],
  ['e2e', 'the browser suite, rooted by playwright.config.ts'],
  ['examples', 'workspace — reference code to copy'],
  ['packages', 'workspace'],
  ['plugins', 'workspace'],
  ['scripts', 'the invariant checks and generators'],
  ['tests', 'cross-package tests, rooted by vitest.config.ts'],
  ['themes', 'workspace'],

  ['.dockerignore', 'must sit at the build context root to apply, and the context is the workspace'],
  ['.env.example', 'the development .env it documents is read from the root (apps/community/next.config.mjs)'],

  // Tooling contracts: each is read from the root by the tool it configures.
  ['package.json', 'the workspace root manifest'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['pnpm-workspace.yaml', 'pnpm'],
  ['turbo.json', 'turbo'],
  ['tsconfig.json', 'the root typecheck project'],
  ['tsconfig.base.json', 'the shared compiler options and path aliases'],
  ['eslint.config.mjs', 'ESLint flat config is discovered at the root'],
  ['vitest.config.ts', 'vitest'],
  ['playwright.config.ts', 'playwright'],
  ['.dependency-cruiser.cjs', 'depcruise, named by the root scripts'],
  ['.dependency-cruiser.webpack.cjs', 'its resolver config, named by the above'],
  ['.gitignore', 'git'],
  ['.gitattributes', 'git'],

  // Community and legal conventions: GitHub and readers expect these here.
  ['README.md', 'the front page'],
  ['LICENSE.md', 'LGPL-3.0-or-later'],
  ['COPYING', 'the GPL text the LGPL incorporates by reference'],
])

const entries = await readdir(ROOT)
const unknown = entries.filter((name) => !ALLOWED.has(name))

// A developer's .env, build output, editor folders — anything gitignored is
// not shipped and not this check's business.
const tolerated = new Set()
if (unknown.length > 0) {
  const result = spawnSync('git', ['check-ignore', '--stdin'], {
    cwd: ROOT,
    input: unknown.join('\n'),
    encoding: 'utf8',
  })
  for (const name of result.stdout.split('\n')) {
    if (name !== '') tolerated.add(name)
  }
}

const problems = unknown.filter((name) => !tolerated.has(name))

if (problems.length > 0) {
  console.error('✗ the repository root is an interface:\n')
  for (const name of problems) {
    console.error(`  - ${name} is new at the root. Put it in a folder, or add it to`)
    console.error('    scripts/root-check.mjs with the reason it has to live there.')
  }
  console.error('')
  process.exit(1)
}

console.log(`✓ repository root: ${entries.length - tolerated.size - problems.length} entries, every one accounted for`)
