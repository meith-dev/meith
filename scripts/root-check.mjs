#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const ALLOWED = new Map([
  ['.git', 'the repository itself'],
  ['.github', 'GitHub reads workflows and community files from this path only'],
  ['apps', 'workspace'],
  ['boards', 'workspace — the stock board docker/Dockerfile builds the official image from'],
  [
    'docker',
    'the deployment interface: the compose files, Dockerfiles, entrypoint and healthcheck',
  ],
  ['docs', 'the documentation set — docs/README.md is its index'],
  ['e2e', 'the browser suite, rooted by playwright.config.ts'],
  ['examples', 'workspace — reference code to copy'],
  [
    'marketplace',
    'curated listings source: schema, listing JSON and screenshots — pnpm marketplace:gen publishes them',
  ],
  ['packages', 'workspace'],
  ['plugins', 'workspace'],
  ['scripts', 'the invariant checks and generators'],
  ['tests', 'cross-package tests, rooted by vitest.config.ts'],
  ['themes', 'workspace'],

  [
    '.dockerignore',
    'must sit at the build context root to apply, and the context is the workspace',
  ],
  [
    '.env.example',
    'the development .env it documents is read from the root (apps/community/next.config.mjs)',
  ],

  ['package.json', 'the workspace root manifest'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['pnpm-workspace.yaml', 'pnpm'],
  ['turbo.json', 'turbo'],
  ['tsconfig.json', 'the root typecheck project'],
  ['tsconfig.base.json', 'the shared compiler options and path aliases'],
  ['biome.json', 'Biome discovers its configuration by walking up to the root'],
  ['vitest.config.ts', 'vitest'],
  ['playwright.config.ts', 'playwright'],
  ['.dependency-cruiser.cjs', 'depcruise, named by the root scripts'],
  ['.dependency-cruiser.webpack.cjs', 'its resolver config, named by the above'],
  ['.gitignore', 'git'],
  ['.gitattributes', 'git'],

  ['README.md', 'the front page'],
  ['AGENTS.md', 'coding agents read it from the root by convention'],
  ['LICENSE.md', 'LGPL-3.0-or-later'],
  ['COPYING', 'the GPL text the LGPL incorporates by reference'],
])

const entries = await readdir(ROOT)
const unknown = entries.filter((name) => !ALLOWED.has(name))

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

console.log(
  `✓ repository root: ${entries.length - tolerated.size - problems.length} entries, every one accounted for`,
)
