/**
 * F13 — `search:reindex`, the operator half of F72's backfill.
 *
 * `search_vector` is written by the *write path*, per post, so it is correct for
 * every post a board has actually posted. Three things leave it null:
 *
 *   - a bulk insert — `seedBoard()`, or an import;
 *   - an existing board adopting search, where old posts predate the column;
 *   - `invalidateIndex()`, run deliberately when the indexed document changes.
 *
 * A null vector matches nothing, and nothing about the resulting board looks
 * broken: the search form works, the query runs, it returns no hits. That is the
 * failure this command exists to make routine — a seeded development board is
 * the common case, and "search is silently empty until an administrator finds a
 * button" is not a reasonable thing to know.
 *
 * **It runs to completion.** The Admin CP action indexes one batch per click,
 * which is right for a browser holding a request open on a two-million-post
 * board and wrong for a terminal — an operator who has to run a command eleven
 * times will stop after the first and believe it is done.
 */
import { PostgresSearchRepository, getDb } from '@forum/db'

import { requirePostgres } from './context'

/**
 * Posts per statement.
 *
 * The Admin CP uses 2,000, sized so one click fits comfortably inside a request.
 * A CLI has no such deadline, and the batch is a single `update … where id in
 * (select … limit N)` whose lock is held for its duration — so this is a
 * compromise between round-trips and how long a concurrent poster can be made to
 * wait, not between round-trips and a timeout.
 */
const BATCH = 5_000

export async function searchReindex(): Promise<number> {
  requirePostgres()
  const search = new PostgresSearchRepository(getDb())

  const before = await search.indexProgress()
  if (before.pending === 0) {
    console.log(`Nothing to do: all ${before.indexed} post(s) are indexed.`)
    return 0
  }

  console.log(`Indexing ${before.pending} post(s)…`)

  /*
   * Resumable by construction rather than by bookkeeping: each chunk selects on
   * `search_vector is null`, a set that only shrinks, so an interrupted run
   * picks up exactly what is left and a re-run costs one query.
   */
  let cursor = 0
  let indexed = 0
  for (;;) {
    const chunk = await search.reindexChunk(cursor, BATCH)
    indexed += chunk.indexed
    if (chunk.nextCursor === null) break
    cursor = chunk.nextCursor
    console.log(`  ${indexed}…`)
  }

  const after = await search.indexProgress()

  /*
   * Reported from a fresh count rather than from the running total. The two
   * agree unless something else wrote posts while this ran, and if they
   * disagree the count is the truth — an operator who is told "done" by a
   * command that did not finish has been told the one thing that makes this
   * failure hard to find in the first place.
   */
  console.log(`Indexed ${indexed} post(s). ${after.indexed} indexed, ${after.pending} pending.`)
  return after.pending === 0 ? 0 : 1
}
