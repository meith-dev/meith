import {
  currentImportRun,
  finishImportRun,
  getDb,
  type ImportFileCopier,
  type ImportSourceName,
  PostgresImportSink,
  saveImportProgress,
  startImportRun,
} from '@meith/db'
import { drivers } from '@meith/drivers'
import {
  type Cursors,
  type ImportReport,
  MysqlMybbSource,
  MysqlPhpbbSource,
  NO_PROGRESS,
  runImport,
} from '@meith/import'

import { integer, optional, parseFlags, required } from './args'
import { UploadsDirCopier } from './import-files'

interface ClosableSource {
  close(): Promise<void>
}

export async function importCommand(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)

  const sourceName = (optional(flags, 'source') ?? 'mybb') as ImportSourceName
  if (sourceName !== 'mybb' && sourceName !== 'phpbb') {
    console.error(`Unknown import source "${sourceName}". Supported sources: mybb, phpbb.`)
    return 1
  }

  const password = process.env.IMPORT_SOURCE_PASSWORD ?? process.env.MYBB_PASSWORD
  if (password === undefined) {
    console.error(
      'Set IMPORT_SOURCE_PASSWORD (MYBB_PASSWORD is also accepted). It is read from the\n' +
        'environment rather than a flag because a password in argv is in your shell\n' +
        'history and in `ps` for every user on the box.',
    )
    return 1
  }

  const options = {
    host: required(flags, 'host'),
    port: integer(flags, 'port'),
    user: required(flags, 'user'),
    password,
    database: required(flags, 'database'),
    tablePrefix: optional(flags, 'prefix'),
    charset: optional(flags, 'charset'),
    ssl: flags.has('ssl'),
  }

  const source =
    sourceName === 'mybb'
      ? await MysqlMybbSource.connect(options)
      : await MysqlPhpbbSource.connect(options)

  try {
    const db = getDb()

    const uploadsDir = optional(flags, 'uploads-dir')
    const copier: ImportFileCopier | undefined =
      uploadsDir === undefined ? undefined : new UploadsDirCopier(uploadsDir, drivers().files)

    const sink = new PostgresImportSink(db, { copier })

    const existing = await currentImportRun(db, sourceName)
    const from: Cursors = { ...NO_PROGRESS, ...existing?.cursors }
    const runId = existing?.id ?? (await startImportRun(db, sourceName))

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

    print(report, uploadsDir !== undefined)
    return 0
  } finally {
    await (source as ClosableSource).close()
  }
}

const describe = (cursors: Cursors): string =>
  Object.entries(cursors)
    .filter(([, id]) => id > 0)
    .map(([kind, id]) => `${kind}:${id}`)
    .join(' ')

function print(report: ImportReport, copiedFiles: boolean): void {
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
    console.log(
      'Import complete. Run `community task:run counters.reconcile` before opening the board.',
    )
    if (!copiedFiles) {
      console.log(
        'Attachment and avatar files were not copied (no --uploads-dir). ' +
          'Run the same command again with --uploads-dir to bring the files across.',
      )
    }
  } else {
    console.log(
      `Stopped after ${report.readThisRun.toLocaleString()} rows (the budget). ` +
        'Not an error — run the same command again to continue from here.',
    )
  }
}
