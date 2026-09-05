#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { commentLines } from '../../scripts/comment-scan.mjs'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const SOURCE = /\.(?:ts|tsx|mts|cts|mjs|cjs|js|jsx)$/
const EXCLUDED = /^templates\/|\.d\.ts$/
const DOC_SOURCES = new Set([
  'packages/theme-kit/src/slots.ts',
  'packages/theme-kit/src/api.ts',
  'packages/theme-kit/src/view-models.ts',
  'packages/plugin-kit/src/hooks.ts',
  'packages/plugin-kit/src/payloads.ts',
  'packages/plugin-kit/src/regions.ts',
])

async function read(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

let event
try {
  event = JSON.parse(await read(process.stdin))
} catch {
  process.exit(0)
}

const edited = event?.tool_input?.file_path
if (typeof edited !== 'string') process.exit(0)

const rel = relative(ROOT, resolve(edited))
if (rel.startsWith('..') || !SOURCE.test(rel) || EXCLUDED.test(rel) || DOC_SOURCES.has(rel)) {
  process.exit(0)
}

let source
try {
  source = await readFile(resolve(ROOT, rel), 'utf8')
} catch {
  process.exit(0)
}

const now = commentLines(source)
if (now.size === 0) process.exit(0)

const head = spawnSync('git', ['show', `HEAD:${rel}`], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
})
const before = head.status === 0 ? new Set(commentLines(head.stdout).values()) : new Set()

const added = [...now.entries()].filter(([, text]) => !before.has(text))
if (added.length === 0) process.exit(0)

const listed = added
  .slice(0, 5)
  .map(([line, text]) => `    ${rel}:${line}  ${text.slice(0, 80)}`)
  .join('\n')

const more = added.length > 5 ? `\n    …and ${added.length - 5} more` : ''

console.error(
  `AGENTS.md: no inline code comments. This change adds ${added.length} to ${rel}:\n\n` +
    `${listed}${more}\n\n` +
    'Remove them. If one explains something a reader needs, that explanation belongs in ' +
    'the relevant document under docs/, changed in the same commit — never in the code. ' +
    'Suppressions (biome-ignore, @ts-expect-error), type annotations (@type, @satisfies) ' +
    'and the JSDoc a generated reference is built from are not counted, so these are real ' +
    'comments. See docs/contributing/development.md, "No inline comments".',
)
process.exit(2)
