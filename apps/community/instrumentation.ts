/**
 * F02 — fail fast on a misconfigured environment.
 *
 * Next calls `register()` once per server process before handling any request.
 * Validating here means a bad deploy dies at startup with a precise message,
 * rather than surfacing as a confusing 500 on whichever page first happens to
 * read the offending variable.
 */

export async function register(): Promise<void> {
  /*
   * Node runtime only, and the guard has to be written exactly like this.
   *
   * Next compiles `instrumentation.ts` once per runtime, and `proxy.ts` means
   * there is an Edge compilation too. `@meith/core`'s barrel reaches
   * `node:crypto` (constant-time compare) and `node:async_hooks` + pino
   * (logging), none of which exist on Edge — so the Edge copy of this module
   * failed to compile, and the failure was a *warning*: `register()` simply
   * never ran there. A fail-fast check that silently does not run in one runtime
   * is worse than none, because the log looks the same either way.
   *
   * `process.env.NEXT_RUNTIME` is replaced with a literal during each
   * compilation, so in the Edge build this reads `'edge' !== 'nodejs'` and the
   * dynamic import below becomes unreachable and is dropped. Reading it through
   * `env` in @meith/core would defeat that — the value would be computed at
   * runtime, the import would stay reachable, and the warning would come back.
   * That is why F02's single-env-reader rule exempts this one variable: it is a
   * build-time bundler token, not board configuration.
   *
   * Nothing is lost on Edge. `proxy.ts` reads cookie names and nothing else —
   * it has no configuration to validate, by design (F17).
   */
  // eslint-disable-next-line no-restricted-properties -- build-time runtime token, not config; see above
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { assertRuntimeEnv } = await import('@meith/core')

  /*
   * Throwing from register() aborts server startup, which is the intent: a
   * server missing AUTH_SECRET must not accept traffic and mint unsigned
   * sessions.
   *
   * `assertRuntimeEnv`, not `assertEnv`: this is the one place that knows a
   * server is starting rather than a build running, so the production rules are
   * enforced here unconditionally — a stray NEXT_PHASE cannot wave them through.
   */
  const env = assertRuntimeEnv()

  if (env.DATA_SOURCE === 'fixture') {
    // eslint-disable-next-line no-console -- pre-logger boot diagnostic
    console.info(
      '[community] DATA_SOURCE=fixture — running against in-memory sample data. ' +
        'Set DATABASE_URL to use Postgres.',
    )
  }
}
