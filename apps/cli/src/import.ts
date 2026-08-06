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

    const existing = await currentImportRun(db)
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
    console.log('Import complete. Run `forum task:run counters.reconcile` before opening the board.')
  } else {
    console.log(
      `Stopped after ${report.readThisRun.toLocaleString()} rows (the budget). ` +
        'Not an error — run the same command again to continue from here.',
    )
  }
}
