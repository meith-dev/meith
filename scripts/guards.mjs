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

/** @type {{id:string,why:string,files:RegExp,pattern:RegExp,allow?:RegExp}[]} */
const GUARDS = [
  {
    id: 'F02 single-env-reader',
    why:
      'process.env may only be read in packages/core/src/env.ts. A stray read is a ' +
      'config value that is never validated and blows up at request time in prod ' +
      'instead of at boot.',
    files: /\.(ts|tsx|mjs)$/,
    pattern: /process\.env/,
    /*
     * `eslint.config.mjs` is exempt because it *mentions* process.env as the
     * subject of the no-restricted-properties rule that bans it. This grep
     * cannot tell a real property read from a string literal describing one —
     * the exact limitation that motivates having the AST-level ESLint rule as
     * well. Keep both: this catches files ESLint does not parse, ESLint catches
     * what a regex misreads.
     *
     * Tooling configs and the CLI/worker run outside the app and have no
     * validated `env` to import, so a direct read is correct there.
     */
    allow:
      /^(packages\/core\/src\/env\.ts|scripts\/|apps\/(cli|worker)\/|eslint\.config\.mjs|.*\.config\.(ts|mts|mjs|js|cjs)$|.*\.test\.ts|packages\/testkit\/)/,
  },
  {
    id: 'R7 no-hardcoded-colour',
    why:
      'Components must consume design tokens so a board can be re-themed from the ' +
      'database (F26). A literal hex/rgb/hsl in a component is a colour that no ' +
      'theme override can ever reach.',
    files: /\.(tsx)$/,
    pattern: /(#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()/,
    // globals.css is the token source; the placeholder page and icons are exempt.
    allow: /^(themes\/[^/]+\/src\/tokens\.ts|packages\/ui\/src\/icons\/)/,
  },
  {
    id: 'F10 no-request-state-in-cache',
    why:
      'Reading cookies()/headers() inside a cached function bakes one user\'s data ' +
      'into a shared cache entry — the classic "logged in as someone else" bug. ' +
      'Pass the viewer in as an explicit cache-key argument instead.',
    files: /\.(ts|tsx)$/,
    pattern: /['"]use cache['"][\s\S]{0,2000}?\b(cookies|headers|draftMode)\s*\(/,
    allow: /^packages\/testkit\//,
  },
  {
    id: 'F17 no-locale-case-fold',
    why:
      'Identifier case-folding must be locale-independent: use foldIdentifier() ' +
      '(packages/accounts/src/case-fold.ts), never toLocaleLowerCase(). With no ' +
      'locale argument the fold depends on the *host*, so under tr_TR "IVAN" ' +
      'becomes "ıvan" — F18\'s duplicate-username-by-case check stops holding, ' +
      'and a username_lower written on one host stops matching on another. A ' +
      'unit test cannot catch this because it passes in every other locale, ' +
      'which is exactly why the rule is enforced textually here.',
    files: /\.(ts|tsx)$/,
    pattern: /toLocale(Lower|Upper)Case\s*\(\s*\)/,
    // The rule's own definition and the test that documents the hazard both
    // have to name the banned call to be about it.
    allow: /^(packages\/accounts\/src\/case-fold\.ts|.*\.test\.ts)/,
  },
  {
    id: 'F02 no-module-scope-logger',
    why:
      'Bind the logger where you log, not at module scope. A module-level ' +
      'instance captures the request context once at import time (i.e. empty), ' +
      'so every line it writes is missing its requestId — and it builds pino ' +
      'eagerly, which reads env.LOG_LEVEL and turns merely importing the module ' +
      'into an environment validation. That is what breaks `next build`, whose ' +
      'page-data collection imports server modules with no production secrets.',
    files: /\.(ts|tsx)$/,
    /*
     * Anchored to column 0: module scope is exactly what has no indentation, so
     * this catches the hoisted binding while leaving `const log = logger(...)`
     * inside a function body alone — which is fine and is what container.ts does.
     */
    pattern: /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(await\s+)?logger\(/m,
  },
  {
    id: 'R2 no-next-in-domain',
    why:
      'Domain packages must not import next/*. Enforced structurally by ' +
      'dependency-cruiser too; this catches it in string form (dynamic import).',
    files: /\.(ts|tsx)$/,
    pattern: /from\s+['"]next(\/|['"])|require\(['"]next(\/|['"])/,
    allow: /^packages\/(core|drivers|ui|theme-kit|testkit|shared)\//,
  },
]

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
  return /^packages\/(accounts|groups|authorization|forums|threads|posts|settings|events|tasks)\//.test(
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
