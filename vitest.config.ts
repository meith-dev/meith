/**
 * F11 — unit and integration test runner.
 *
 * Resolves `@forum/*` through the same tsconfig path aliases the compiler and
 * dependency-cruiser use, so a test importing a package exercises exactly the
 * module the build would pick.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * Aliases are derived from tsconfig.base.json rather than duplicated here.
 * Hand-maintaining a second copy is how test and build resolution silently
 * diverge — the exact failure mode that made the boundary lint inert earlier.
 */
function aliasesFromTsconfig(): Record<string, string> {
  const raw = readFileSync(resolve(root, 'tsconfig.base.json'), 'utf8')
  // Strip line comments; tsconfig permits them, JSON.parse does not.
  const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '')) as {
    compilerOptions?: { paths?: Record<string, string[]> }
  }

  const paths = json.compilerOptions?.paths ?? {}
  const aliases: Record<string, string> = {}

  for (const [key, targets] of Object.entries(paths)) {
    const target = targets[0]
    if (!target) continue
    aliases[key.replace(/\/\*$/, '')] = resolve(root, target.replace(/\/\*$/, ''))
  }

  return aliases
}

export default defineConfig({
  resolve: {
    alias: {
      ...aliasesFromTsconfig(),
      // Next injects `server-only`; there is no bundler boundary under vitest,
      // so alias it to a harmless stub to let server modules be tested directly.
      'server-only': resolve(root, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    /* Node, not jsdom: these suites cover domain logic and data access. */
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.next/**'],
    /*
     * Postgres-backed suites are opt-in via a separate project so `pnpm test`
     * stays runnable with no database (which is the state of this checkout).
     */
    /*
     * LOG_LEVEL=fatal because several suites deliberately drive failure paths —
     * a queue handler that throws, a job that dead-letters — and their
     * error-level output is expected. Left at the default, a fully passing run
     * prints error JSON, which teaches everyone to skim past CI output and is
     * how a real error goes unnoticed. Nothing asserts on log output; a suite
     * that needs to can override this.
     */
    env: { NODE_ENV: 'test', DATA_SOURCE: 'fixture', LOG_LEVEL: 'fatal' },
    /*
     * The PGlite suites boot a real Postgres (compiled to WASM) and apply every
     * migration in `beforeAll`. That is seconds of genuine work, and vitest runs
     * files in parallel, so several instances boot at once and contend for CPU.
     *
     * The 10s default was already marginal and started flaking when the group
     * seed became a second migration. Raised rather than worked around: the
     * alternative is sharing one database across files, which trades a slow hook
     * for cross-file test pollution. A hook that legitimately takes 5s should not
     * be a coin flip.
     */
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
})
