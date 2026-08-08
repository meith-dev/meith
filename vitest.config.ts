/**
 * F11 — unit and integration test runner.
 *
 * Resolves `@meith/*` through the same tsconfig path aliases the compiler and
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
  /*
   * F25: transform JSX here rather than inheriting `jsx: "preserve"` from
   * tsconfig.base.json.
   *
   * `preserve` is correct for the build — Next does the transform — but it means
   * esbuild hands vitest untransformed JSX, and importing any `.tsx` fails with
   * "content contains invalid JS syntax". That made a theme slot untestable, and
   * unreachable even indirectly: the token sync test imports the theme's barrel,
   * which now re-exports its slot components.
   *
   * `automatic` matches what Next uses, so a component behaves the same under
   * test as in the app.
   *
   * It has to be `oxc`, not `esbuild`: Vite 8 transforms with oxc, and the
   * `esbuild` key is silently ignored — it was set first and changed nothing,
   * which is worth knowing before anyone copies the older recipe back in.
   */
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  resolve: {
    alias: {
      ...aliasesFromTsconfig(),
      // Next injects `server-only`; there is no bundler boundary under vitest,
      // so alias it to a harmless stub to let server modules be tested directly.
      'server-only': resolve(root, 'tests/stubs/server-only.ts'),
      /*
       * F81: `@/` is the app's own alias and is deliberately absent from
       * tsconfig.base.json (see the depcruise webpack config, D82). Without it
       * here, a route handler under `app/` cannot be imported by a test at all —
       * which is how the API's route table would have gone uncovered.
       */
      '@': resolve(root, 'apps/community/src'),
    },
  },
  test: {
    /* Node, not jsdom: these suites cover domain logic and data access. */
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      /*
       * F77: themes are workspace packages and were the one tier with nowhere to
       * put a test. Their coverage lived in `apps/community` (the token sync test),
       * which meant a theme could not assert anything about itself — and F78
       * ships a second one whose whole job is to prove the contract holds for a
       * theme that is not the default.
       */
      'themes/**/*.test.ts',
      'plugins/**/*.test.ts',
      'examples/**/*.test.ts',
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
    /*
     * The 5s default is a *test* timeout, and it is not generous enough for the
     * Argon2id paths under load. `loginAction`'s lockout test hashes a password
     * per attempt at the configured cost while several PGlite suites hold the
     * other workers, and it began timing out at 5s once F38 added four more
     * database suites — passing on its own, failing one run in a few in a full
     * one. Raised rather than left as a re-run: same reasoning as the worker cap
     * below. Still far below any plausible genuine hang.
     */
    testTimeout: 20_000,
    /*
     * Nineteen suites now boot their own PGlite — a full Postgres compiled to
     * WASM, held in process memory. Left unbounded, vitest starts one worker
     * per core and fifteen WASM databases compete for ten cores, so boot hooks
     * start missing even a 30s timeout. It failed roughly one run in three.
     *
     * Capping workers trades a little wall-clock for a gate that is trustworthy,
     * which is the right way round: a suite that fails one run in three teaches
     * people to re-run it, and then a real failure gets re-run too.
     *
     * The structural alternative — sharing one database across files — trades
     * this for cross-file pollution, which is a worse bargain.
     */
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
})
