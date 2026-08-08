/**
 * F85 — `community import`.
 *
 * The operator-facing half of the MyBB import. Everything it decides is already
 * decided elsewhere: `@meith/import` owns the mapping, the paging, the cursors
 * and the counter comparison; `@meith/db` owns the sink. This file connects the
 * two and prints what happened.
 *
 * ## Resumable means "run it again", and the command has to say so
 *
 * The runner works to a row budget and hands back cursors. Those cursors are
 * persisted by the import-run row, so a second invocation continues rather than
 * restarting — and the command prints that in as many words when a run stops
 * short, because an operator who does not know it is resumable will either start
 * over or assume the import failed.
 *
 * ## The password is not an argument
 *
 * `--password` on a command line lands in shell history, in `ps` output for
 * every user on the box, and in whatever collects process telemetry. It is read
 * from `MYBB_PASSWORD` instead, the same way `user:create` reads a password from
 * stdin rather than `argv`.
 */

import {
  currentImportRun,
  finishImportRun,
  getDb,
  PostgresImportSink,
  saveImportProgress,
  startImportRun,
} from '@meith/db'
import {
  MysqlMybbSource,
  NO_PROGRESS,
  runImport,
  type Cursors,
  type ImportReport,
} from '@meith/import'

import { integer, optional, parseFlags, required } from './args'

export async function importCommand(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)

  const password = process.env.MYBB_PASSWORD
  if (password === undefined) {
    console.error(
      'Set MYBB_PASSWORD. It is read from the environment rather than a flag because a\n' +
        'password in argv is in your shell history and in `ps` for every user on the box.',
    )
    return 1
  }

  const source = await MysqlMybbSource.connect({
    host: required(flags, 'host'),
    port: integer(flags, 'port'),
    user: required(flags, 'user'),
    password,
    database: required(flags, 'database'),
    tablePrefix: optional(flags, 'prefix'),
    charset: optional(flags, 'charset'),
    ssl: flags.has('ssl'),
  })

  try {
    const db = getDb()
    const sink = new PostgresImportSink(db)

    /*
     * Resume from the recorded cursors, not from zero. Re-reading rows would be
     * harmless — every write is keyed on `(kind, legacyId)` — but on a board of
     * any size it is also hours, and an import that starts over each time is one
     * nobody can finish.
     */
    const existing = await currentImportRun(db)
    /*
     * The stored cursors are `Record<string, number>` — jsonb, so the database
     * cannot promise which keys are there. Merged over `NO_PROGRESS` rather than
     * cast, because a run recorded before a kind existed would otherwise produce
     * `undefined` where the runner expects 0 and start that kind at `NaN`.
     */
    const from: Cursors = { ...NO_PROGRESS, ...existing?.cursors }
    const runId = existing?.id ?? (await startImportRun(db))

    if (existing !== null) {
      console.log(`Resuming import run ${runId} from ${describe(from)}.`)
    }

    const report = await runImport({
      source,
      sink,
      pageSize: integer(flags, 'page-size'),
      budget: integer(flags, 'budget'),
      from,
    })

    await saveImportProgress(db, runId, report.cursors, report.readThisRun, report.kinds)
    if (report.finished) await finishImportRun(db, runId, 'finished', null)

    print(report)
    return 0
  } finally {
    /*
     * Always. A command that leaves a connection open against somebody's live
     * community is a command that eventually exhausts its connection limit — and the
     * board it exhausts is the one still serving members.
     */
    await source.close()
  }
}

const describe = (cursors: Cursors): string =>
  Object.entries(cursors)
    .map(([kind, id]) => `${kind}:${id}`)
    .join(' ')

function print(report: ImportReport): void {
  const width = Math.max(...Object.keys(report.kinds).map((k) => k.length))

  for (const [kind, result] of Object.entries(report.kinds)) {
    console.log(
      `  ${kind.padEnd(width)}  read ${String(result.read).padStart(7)}  ` +
        `inserted ${String(result.inserted).padStart(7)}  ` +
        `updated ${String(result.updated).padStart(7)}  ` +
        `skipped ${String(result.skipped.length).padStart(5)}`,
    )
  }

  /*
   * Skipped rows are printed, never summarised away. A row the sink refused is
   * a row that is not on the new board, and "12 skipped" with no detail is a
   * number an operator can do nothing with.
   */
  for (const [kind, result] of Object.entries(report.kinds)) {
    for (const skip of result.skipped.slice(0, 20)) {
      console.log(`  skipped ${kind} ${skip.legacyId}: ${skip.reason}`)
    }
    if (result.skipped.length > 20) {
      console.log(`  … and ${result.skipped.length - 20} more skipped ${kind}`)
    }
  }

  console.log('')
  if (report.finished) {
    console.log('Import complete. Run `community task:run counters.reconcile` before opening the board.')
  } else {
    console.log(
      `Stopped after ${report.readThisRun.toLocaleString()} rows (the budget). ` +
        'Not an error — run the same command again to continue from here.',
    )
  }
}
