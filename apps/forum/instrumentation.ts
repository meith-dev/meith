/**
 * F02 — fail fast on a misconfigured environment.
 *
 * Next calls `register()` once per server process before handling any request.
 * Validating here means a bad deploy dies at startup with a precise message,
 * rather than surfacing as a confusing 500 on whichever page first happens to
 * read the offending variable.
 */

export async function register(): Promise<void> {
  const { assertRuntimeEnv } = await import('@forum/core')

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
      '[forum] DATA_SOURCE=fixture — running against in-memory sample data. ' +
        'Set DATABASE_URL to use Postgres.',
    )
  }
}
