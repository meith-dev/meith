export async function register(): Promise<void> {
  // biome-ignore lint/style/noProcessEnv: build-time runtime token, not config; see above
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { assertRuntimeEnv, initTracing } = await import('@meith/core')

  const env = assertRuntimeEnv()

  if (env.DATA_SOURCE === 'fixture') {
    // biome-ignore lint/suspicious/noConsole: pre-logger boot diagnostic
    console.info(
      '[forum] DATA_SOURCE=fixture — running against in-memory sample data. ' +
        'Set DATABASE_URL to use Postgres.',
    )
  }

  await initTracing('meith-web')
}
