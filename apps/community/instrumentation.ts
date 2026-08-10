export async function register(): Promise<void> {
  // eslint-disable-next-line no-restricted-properties -- build-time runtime token, not config; see above
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { assertRuntimeEnv } = await import('@meith/core')

  const env = assertRuntimeEnv()

  if (env.DATA_SOURCE === 'fixture') {
    // eslint-disable-next-line no-console -- pre-logger boot diagnostic
    console.info(
      '[forum] DATA_SOURCE=fixture — running against in-memory sample data. ' +
        'Set DATABASE_URL to use Postgres.',
    )
  }
}
