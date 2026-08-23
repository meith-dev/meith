import { ConfigurationError, env } from '@meith/core'
import { getDb } from '@meith/db'
import { resetDemoBoard, seedDemoBoard } from '@meith/demo'
import type { PluginDefinition } from '@meith/plugin-kit'

import { requirePostgres } from './context'

function requireDemoMode(): void {
  if (!env.DEMO_MODE) {
    throw new ConfigurationError(
      'DEMO_MODE is not set, and this command destroys the board it is pointed ' +
        'at. If this really is a demo, set DEMO_MODE=1 in the environment; if it ' +
        'is not, you have the wrong DATABASE_URL.',
    )
  }
}

async function plugins(): Promise<readonly PluginDefinition[]> {
  const { installedPluginDefinitions } = await import('@board/plugins')
  return installedPluginDefinitions()
}

export async function demoSeed(): Promise<number> {
  requirePostgres()
  requireDemoMode()

  const summary = await seedDemoBoard(getDb(), new Date(), { plugins: await plugins() })

  console.log(
    `Seeded ${summary.members} member(s), ${summary.forums} forum(s), ` +
      `${summary.threads} thread(s) and ${summary.posts} post(s).`,
  )
  if (summary.plugins.length > 0) {
    console.log(`Furnished plugin(s): ${summary.plugins.join(', ')}.`)
  }
  return 0
}

export async function demoReset(args: readonly string[]): Promise<number> {
  requirePostgres()
  requireDemoMode()

  if (!args.includes('--yes')) {
    console.error(
      'This drops every table in the database and writes the demo board back.\n' +
        'Nothing survives it. Re-run with --yes if that is what you want.',
    )
    return 1
  }

  const result = await resetDemoBoard({ db: getDb(), plugins: await plugins() })

  console.log(
    `Reset in ${Math.round(result.elapsedMs / 1000)}s: ` +
      `${result.migrationsApplied} migration(s), ${result.members} member(s), ` +
      `${result.forums} forum(s), ${result.threads} thread(s), ${result.posts} post(s)` +
      `${result.plugins.length === 0 ? '' : `, plugin(s) ${result.plugins.join(', ')}`}.`,
  )
  console.log('Uploaded files are untouched — the web container clears those on its own reset.')
  return 0
}
