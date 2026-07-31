#!/usr/bin/env node
/**
 * Textual invariant guards.
 *
 * Some rules in the plan are about *text*, not module graphs, so
 * dependency-cruiser cannot see them: "process.env appears in exactly one
 * file", "no component hardcodes a colour", "cookies() is never read inside a
 * cached function". Each guard below maps to a numbered requirement and fails
 * the build with the reason, not just a line number.
 *
 * Run: pnpm guards
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { GUARDS } from './guards.config.mjs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.turbo',
  'coverage',
  'v0_plans',
  'user_read_only_context',
])

/** Recursively collect candidate source files. */
async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      await walk(join(dir, e.name), out)
    } else if (e.isFile()) {
      out.push(join(dir, e.name))
    }
  }
  return out
}

function isDomainPath(rel) {
  return /^packages\/(accounts|groups|authorization|forums|threads|posts|bbcode|moderation|settings|events|tasks)\//.test(
    rel,
  )
}

const files = await walk(ROOT)
let failures = 0

for (const guard of GUARDS) {
  for (const abs of files) {
    const rel = relative(ROOT, abs)
    if (!guard.files.test(rel)) continue
    if (guard.allow?.test(rel)) continue
    if (guard.id === 'R2 no-next-in-domain' && !isDomainPath(rel)) continue

    const source = await readFile(abs, 'utf8')
    const match = guard.pattern.exec(source)
    if (!match) continue

    const line = source.slice(0, match.index).split('\n').length
    console.error(`\n✖ ${guard.id}`)
    console.error(`  ${rel}:${line}`)
    console.error(`  found: ${match[0].slice(0, 80).replace(/\n/g, ' ⏎ ')}`)
    console.error(`  why:   ${guard.why}`)
    failures++
  }
}

if (failures > 0) {
  console.error(`\n${failures} invariant violation(s).\n`)
  process.exit(1)
}
console.log('✓ all textual invariants hold')
