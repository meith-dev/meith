#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { commentLines } from './comment-scan.mjs'
import { ROOT } from './repo-files.mjs'

const SOURCE = /\.(?:ts|tsx|mts|cts|mjs|cjs|js|jsx)$/
const EXCLUDED = /^templates\/|\.d\.ts$/

const DOC_SOURCES = new Map([
  ['packages/theme-kit/src/slots.ts', 'pnpm theme:docs'],
  ['packages/theme-kit/src/api.ts', 'pnpm theme:docs'],
  ['packages/theme-kit/src/view-models.ts', 'pnpm theme:docs'],
  ['packages/plugin-kit/src/hooks.ts', 'pnpm plugin:docs'],
  ['packages/plugin-kit/src/payloads.ts', 'pnpm plugin:docs'],
  ['packages/plugin-kit/src/regions.ts', 'pnpm plugin:docs'],
])

const STAGED = process.argv.includes('--staged')

function git(args, options = {}) {
  return spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
}

const listing = STAGED
  ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
  : git(['diff', 'HEAD', '--name-only', '--diff-filter=ACMR', '-z'])

if (listing.status !== 0) {
  console.error('✗ inline comments: could not list changed files')
  process.exit(1)
}

const changed = listing.stdout
  .split('\0')
  .filter((rel) => rel !== '' && SOURCE.test(rel) && !EXCLUDED.test(rel) && !DOC_SOURCES.has(rel))

if (changed.length === 0) {
  console.log('✓ inline comments: no source file changed')
  process.exit(0)
}

async function after(rel) {
  if (!STAGED) return readFile(join(ROOT, rel), 'utf8').catch(() => null)
  const staged = git(['show', `:${rel}`])
  return staged.status === 0 ? staged.stdout : null
}

const problems = []

for (const rel of changed) {
  const source = await after(rel)
  if (source === null) continue

  const now = commentLines(source)
  if (now.size === 0) continue

  const head = git(['show', `HEAD:${rel}`])
  const before = head.status === 0 ? new Set(commentLines(head.stdout).values()) : new Set()

  const added = [...now.entries()].filter(([, text]) => !before.has(text))
  if (added.length === 0) continue

  problems.push({ rel, added })
}

if (problems.length === 0) {
  console.log(`✓ inline comments: ${changed.length} changed source file(s), no comment added`)
  process.exit(0)
}

const total = problems.reduce((sum, { added }) => sum + added.length, 0)
console.error(`✗ inline comments: ${total} added across ${problems.length} file(s)\n`)

for (const { rel, added } of problems) {
  for (const [line, text] of added.slice(0, 5)) {
    console.error(`    ${rel}:${line}  ${text.slice(0, 80)}`)
  }
  if (added.length > 5) console.error(`    …and ${added.length - 5} more in ${rel}`)
}

console.error(
  '\n  AGENTS.md: no inline code comments. An explanation belongs in the relevant\n' +
    '  document under docs/, changed in the same commit — never in the code.\n\n' +
    '  Suppressions (biome-ignore, @ts-expect-error), compiler-read type annotations\n' +
    '  (@type, @satisfies) and the prose in the six files a generated reference is\n' +
    '  built from are not counted, so these are real comments.\n\n' +
    '  docs/contributing/development.md, "No inline comments", has the whole rule.\n',
)
process.exit(1)
