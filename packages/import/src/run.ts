/**
 * F85 — the import run: chunked, resumable, idempotent.
 *
 * Three words that are easy to claim and each of which is a design constraint:
 *
 * **Chunked** — a page at a time, bounded. A board with two million posts cannot
 * be imported in one request on any platform this targets, and an import that
 * needs a machine you can leave running for an hour is one a serverless operator
 * cannot use at all.
 *
 * **Resumable** — the cursor is a *legacy id*, so it means the same thing on the
 * next run, on a different instance, after a crash. An offset would not: the
 * source board is usually still live during a migration, and an offset walk over
 * a table being written to skips rows.
 *
 * **Idempotent** — every write is keyed on `(kind, legacyId)`, so importing the
 * same page twice writes the same row twice and changes nothing. This is not a
 * nicety: a chunked import *will* be interrupted, and the recovery instruction
 * has to be "run it again".
 *
 * ## Order is a dependency graph, not a preference
 *
 * Users, then forums, then threads, then posts. A thread references a forum and
 * an author; a post references a thread. Importing posts first means either
 * inventing the parents or holding every post in memory until the thread arrives
 * — and the second is the design that works on a small board and dies on a real
 * one.
 *
 * ## What the runner does not do
 *
 * It does not compute counters. MyBB's own are imported so the report can say
 * how far off they were, and the board's recount tool (F38) is what produces the
 * real ones afterwards — a board's counters should be a function of its content,
 * and importing somebody else's arithmetic bakes in their drift.
 */

import { mapForum, mapPost, mapThread, mapUser } from './map'
import type { ImportedForum, ImportedPost, ImportedThread, ImportedUser } from './map'
import type { MybbSource } from './source'

export const KINDS = ['users', 'forums', 'threads', 'posts'] as const
export type Kind = (typeof KINDS)[number]

/**
 * Where a run has got to, per kind.
 *
 * A record rather than a single cursor, because the kinds are imported in
 * sequence and a run interrupted during `threads` must not restart `users`.
 */
export type Cursors = Readonly<Record<Kind, number>>

export const NO_PROGRESS: Cursors = { users: 0, forums: 0, threads: 0, posts: 0 }

/**
 * Where imported rows go.
 *
 * A port, so the fixture round trip proves the runner without a database — and
 * so the Postgres implementation is the only thing that needs a Postgres test.
 * Every method is idempotent on `legacyId` and reports what it did, which is
 * what the counter proof is built from.
 */
export interface ImportSink {
  putUsers(rows: readonly ImportedUser[]): Promise<WriteResult>
  putForums(rows: readonly ImportedForum[]): Promise<WriteResult>
  putThreads(rows: readonly ImportedThread[]): Promise<WriteResult>
  putPosts(rows: readonly ImportedPost[]): Promise<WriteResult>
}

export interface WriteResult {
  readonly inserted: number
  readonly updated: number
  /** Rows the sink refused, with why. Reported, never silently dropped. */
  readonly skipped: readonly { readonly legacyId: number; readonly reason: string }[]
}

export interface KindReport {
  readonly read: number
  readonly inserted: number
  readonly updated: number
  readonly skipped: readonly { readonly legacyId: number; readonly reason: string }[]
}

export interface ImportReport {
  readonly kinds: Readonly<Record<Kind, KindReport>>
  readonly cursors: Cursors
  /** `true` when every kind is exhausted. */
  readonly finished: boolean
  /** Rows read this run, across every kind. Bounded by the budget. */
  readonly readThisRun: number
}

export interface RunOptions {
  readonly source: MybbSource
  readonly sink: ImportSink
  /** Rows per page. */
  readonly pageSize?: number | undefined
  /**
   * Stop after this many rows, whatever remains.
   *
   * The whole reason the import is resumable. A serverless function has a
   * deadline, and a run that ignores it is killed mid-page with an unrecorded
   * cursor — losing the progress that made chunking worth doing.
   */
  readonly budget?: number | undefined
  readonly from?: Cursors | undefined
}

const emptyKind = (): KindReport => ({ read: 0, inserted: 0, updated: 0, skipped: [] })

/**
 * Import until the budget runs out or the source is exhausted.
 *
 * Returns the cursors to pass back. The caller persists them; this function
 * holds no state, which is what lets the next run happen in a different process.
 */
export async function runImport(options: RunOptions): Promise<ImportReport> {
  const pageSize = options.pageSize ?? 200
  const budget = options.budget ?? 2000
  const cursors: Record<Kind, number> = { ...NO_PROGRESS, ...options.from }

  const kinds: Record<Kind, KindReport> = {
    users: emptyKind(),
    forums: emptyKind(),
    threads: emptyKind(),
    posts: emptyKind(),
  }

  let readThisRun = 0
  const exhausted = new Set<Kind>()

  /*
   * Sequential, in dependency order, and a kind is finished before the next
   * starts. Interleaving would import a thread whose forum has not arrived —
   * the sink would refuse it, the report would fill with skips, and the run
   * would look like a failure when it was only out of order.
   */
  for (const kind of KINDS) {
    while (readThisRun < budget) {
      const limit = Math.min(pageSize, budget - readThisRun)
      const outcome = await importPage(kind, options, cursors[kind], limit)

      kinds[kind] = merge(kinds[kind], outcome.report)
      readThisRun += outcome.report.read

      if (outcome.nextCursor === null) {
        exhausted.add(kind)
        break
      }
      cursors[kind] = outcome.nextCursor
    }
  }

  return {
    kinds,
    cursors,
    finished: KINDS.every((kind) => exhausted.has(kind)),
    readThisRun,
  }
}

function merge(a: KindReport, b: KindReport): KindReport {
  return {
    read: a.read + b.read,
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    skipped: [...a.skipped, ...b.skipped],
  }
}

async function importPage(
  kind: Kind,
  options: RunOptions,
  after: number,
  limit: number,
): Promise<{ report: KindReport; nextCursor: number | null }> {
  const { source, sink } = options

  /*
   * An empty page reaches the sink as nothing at all.
   *
   * It happens on every run whose last page was exactly full: `nextCursor` is
   * only null on a *short* page (see `source.ts`), so the read after it comes
   * back with no rows. Handing the sink an empty array would be a write per
   * kind per run that does nothing — and against Postgres, a transaction per
   * kind for the privilege. A test caught the extra call rather than a reader.
   */
  const write = async <T>(
    page: { rows: readonly T[]; nextCursor: number | null },
    map: (row: T) => unknown,
    put: (rows: never) => Promise<WriteResult>,
  ): Promise<{ report: KindReport; nextCursor: number | null }> => {
    if (page.rows.length === 0) return { report: emptyKind(), nextCursor: page.nextCursor }
    const written = await put(page.rows.map(map) as never)
    return { report: report(page.rows.length, written), nextCursor: page.nextCursor }
  }

  switch (kind) {
    case 'users':
      return write(await source.users(after, limit), mapUser, sink.putUsers.bind(sink))
    case 'forums':
      return write(await source.forums(after, limit), mapForum, sink.putForums.bind(sink))
    case 'threads':
      return write(await source.threads(after, limit), mapThread, sink.putThreads.bind(sink))
    case 'posts':
      return write(await source.posts(after, limit), mapPost, sink.putPosts.bind(sink))
  }
}

function report(read: number, written: WriteResult): KindReport {
  return { read, inserted: written.inserted, updated: written.updated, skipped: written.skipped }
}

/**
 * The counter proof, as a comparison rather than an assertion.
 *
 * MyBB's own counters are imported; this holds them against what the content
 * actually contains. A mismatch is **not** an import failure — it is usually
 * MyBB's drift, which is the point — so it is reported and the recount tool
 * (F38) is what fixes it.
 *
 * Reporting it at all is what turns "the counts look wrong" after a migration
 * from a mystery into a line somebody read on the day.
 */
export interface CounterComparison {
  readonly legacyId: number
  readonly field: string
  readonly claimed: number
  readonly actual: number
}

export function compareCounters(input: {
  readonly forums: readonly ImportedForum[]
  readonly threads: readonly ImportedThread[]
  readonly posts: readonly ImportedPost[]
  /** MyBB's claimed per-forum totals, keyed by legacy forum id. */
  readonly claimedForumTotals: Readonly<Record<number, { threads: number; posts: number }>>
}): readonly CounterComparison[] {
  const differences: CounterComparison[] = []

  /*
   * Only visible content counts, which is the same rule the board's own counters
   * follow (F38/F47). Counting deleted posts would make every imported board
   * disagree with itself the moment a moderator looked at it.
   */
  const visibleThreads = input.threads.filter((thread) => thread.visibility === 'visible')
  const visiblePosts = input.posts.filter((post) => post.visibility === 'visible')

  for (const forum of input.forums) {
    const claimed = input.claimedForumTotals[forum.legacyId]
    if (claimed === undefined) continue

    const actualThreads = visibleThreads.filter(
      (thread) => thread.legacyForumId === forum.legacyId,
    ).length
    const actualPosts = visiblePosts.filter((post) => post.legacyForumId === forum.legacyId).length

    if (claimed.threads !== actualThreads) {
      differences.push({
        legacyId: forum.legacyId,
        field: 'threads',
        claimed: claimed.threads,
        actual: actualThreads,
      })
    }
    if (claimed.posts !== actualPosts) {
      differences.push({
        legacyId: forum.legacyId,
        field: 'posts',
        claimed: claimed.posts,
        actual: actualPosts,
      })
    }
  }

  /* Per thread, the reply count MyBB claims against the posts that exist. */
  for (const thread of visibleThreads) {
    const actual = Math.max(
      0,
      visiblePosts.filter((post) => post.legacyThreadId === thread.legacyId).length - 1,
    )
    if (thread.replyCount !== actual) {
      differences.push({
        legacyId: thread.legacyId,
        field: 'replies',
        claimed: thread.replyCount,
        actual,
      })
    }
  }

  return differences
}
