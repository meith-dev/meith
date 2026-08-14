import { createServer } from 'node:net'

import { closeDb, getDb } from '@meith/db'
import { demoResetTask } from '@meith/demo'

import { installedPluginDefinitions } from '../../apps/community/community.plugins'

import { DEMO_DATABASE_URL, DEMO_DB_PORT, DEMO_READY_PORT } from './config'
import { startDatabase } from './database'

async function main(): Promise<void> {
  const database = await startDatabase({
    seeded: false,
    port: DEMO_DB_PORT,
    maxConnections: 2,
  })

  const task = demoResetTask({ db: getDb(), plugins: installedPluginDefinitions() })

  const result = await task.run({
    now: new Date(),
    lastRunAt: null,
    elapsedSeconds: 0,
    signal: AbortSignal.timeout(task.maxDurationSeconds * 1_000),
  })

  const summary = result.detail ?? {}

  await closeDb()

  const ready = createServer()
  await new Promise<void>((resolve) => ready.listen(DEMO_READY_PORT, '127.0.0.1', resolve))

  // eslint-disable-next-line no-console -- this is a process; its output is its status
  console.log(
    `demo board listening on ${DEMO_DATABASE_URL} — ` +
      `${summary.forums} forum(s), ${summary.threads} thread(s), ${summary.posts} post(s)`,
  )

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      ready.close()
      void database.stop().finally(() => process.exit(0))
    })
  }
}

void main()
