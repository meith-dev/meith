/*
 * The board the marketing site is photographed against.
 *
 * `database.ts` serves the fixture the behaviour specs assert on: four forums,
 * a handful of threads, and content written to be *checked* rather than to be
 * looked at. Nothing about it photographs well, which is the whole reason this
 * file exists.
 *
 * What this starts instead is the demo board — the twenty forums, 157 threads
 * and 896 posts of `packages/demo`, the same seed that runs at demo.meith.dev.
 * It is written to be read: a fixture list, a raid roster, an AGM and a lost
 * gear bag sitting in the same forum tree. See docs/demo-mode.md.
 *
 * It reads no configuration of its own. `DEMO_MODE`, the database URL and the
 * rest arrive from `e2e/screenshot-site.config.ts`, which is what starts this
 * process and which declares the same environment for the web server that
 * follows it — one place, so the two cannot disagree about which board they
 * are talking about. Run this file by hand and it will refuse to boot, which
 * is the correct answer: by hand there is nothing to photograph.
 */
import { createServer } from 'node:net'

import { closeDb, getDb } from '@meith/db'
import { demoResetTask } from '@meith/demo'

import { installedPluginDefinitions } from '../../apps/community/community.plugins'

import { DEMO_DATABASE_URL, DEMO_DB_PORT, DEMO_READY_PORT } from './config'
import { startDatabase } from './database'

async function main(): Promise<void> {
  /*
   * Two connections rather than the fixture's one, so the seed's connection and
   * the web server's never contend for the same slot. Only one is ever open at a
   * time — the seed closes its own before the readiness port opens.
   */
  const database = await startDatabase({
    seeded: false,
    port: DEMO_DB_PORT,
    maxConnections: 2,
  })

  /*
   * The board is built by running the demo's own reset *task* rather than by
   * calling `resetDemoBoard` under it, and the difference is the one line the
   * task adds: it stamps the run in the `tasks` table.
   *
   * Without that stamp `demo.reset` reads as never having run, which makes it
   * due immediately — and the spec ticks the scheduler to build the search
   * index. The board would be dropped and rebuilt halfway through the run, and
   * every shot after it would be of a signed-out stranger looking at a board a
   * few seconds old.
   */
  const task = demoResetTask({ db: getDb(), plugins: installedPluginDefinitions() })

  const result = await task.run({
    now: new Date(),
    lastRunAt: null,
    elapsedSeconds: 0,
    signal: AbortSignal.timeout(task.maxDurationSeconds * 1_000),
  })

  const summary = result.detail ?? {}

  // The seed's connection is no use to anybody once the board is written, and
  // PGlite counts it against the connection limit until it is closed.
  await closeDb()

  // Opened last, and only ever here. See DEMO_READY_PORT in ./config.
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
