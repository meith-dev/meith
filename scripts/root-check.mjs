#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

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
  [
    'templates',
    'generated deploy templates — pnpm templates:gen writes templates/self-host and templates/vercel from create-meith’s scaffold(), and each is pushed to a repository of its own. Not a workspace: every entry is generated output, and boards/* is a pnpm workspace glob that would claim one as a package',
  ],
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

  [
    '.claude',
    'Claude Code reads settings.json and hooks/ from this path only — the guardrails every session in this repository loads. Everything else under it is ignored by git',
  ],
  [
    '.githooks',
    'core.hooksPath points here, set by the prepare script — the guardrail that applies to every tool and every person, not only to an agent that reads AGENTS.md',
  ],

  ['README.md', 'the front page'],
  ['AGENTS.md', 'coding agents read it from the root by convention'],
  [
    'CLAUDE.md',
    'a symlink to AGENTS.md: Claude Code loads CLAUDE.md by name, and one file cannot drift from the other',
  ],
  ['LICENSE.md', 'MIT'],
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
