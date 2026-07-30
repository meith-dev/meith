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
    env: { NODE_ENV: 'test', DATA_SOURCE: 'fixture' },
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
})
