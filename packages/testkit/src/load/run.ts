/**
 * F89 — the load runner.
 *
 * Two subcommands, and the split is the point:
 *
 *     pnpm perf seed       # build the board — slow, once
 *     pnpm perf measure    # read it — fast, repeatedly
 *
 * A harness that reseeded before every run would make measuring a change
 * expensive enough that nobody would, and the seed is the slow half by two
 * orders of magnitude. Keeping them apart means "did that index help?" is a
 * thirty-second question.
 *
 * It needs a real Postgres. PGlite is Postgres compiled to WASM holding the
 * database in process memory, which is the right trade for the test suite and
 * the wrong one here: two million posts do not fit, and the numbers would be
 * measuring the WASM boundary rather than the query plan.
 */

import { Authorizer } from '@meith/authorization'
import { PUBLIC_CONTENT } from '@meith/core'
import {
  ActorBuilder,
  getDb,
  PostgresAuthorizationSource,
  PostgresCounterRecount,
  PostgresDiscoveryRepository,
  PostgresForumRepository,
  PostgresMemberProfileRepository,
  PostgresPostRepository,
  PostgresSearchRepository,
  PostgresThreadRepository,
  schema,
  type Database,
} from '@meith/db'
import { desc, eq, sql } from 'drizzle-orm'
import { writeFile } from 'node:fs/promises'
import { cpus, totalmem } from 'node:os'

import { FULL_SCALE, SMOKE_SCALE, seedBoard, type SeedScale } from '../seed'
import { BUDGETS } from './budgets'
import { INDEX_PLANS, readPlan, type PlanResult } from './index-plans'
import {
  DEFAULT_MEASURE,
  measure,
  verdict,
  type Measurement,
  type Scenario,
  type Verdict,
} from './measure'

/* ------------------------------------------------------------------ *
 * Seeding
 * ------------------------------------------------------------------ */

/**
 * Building the board, in four phases that can each be run on their own.
 *
 * ## Why it is phased rather than one command
 *
 * A full-scale seed is twenty minutes of work, and twenty minutes is long
 * enough that something will interrupt it: a laptop sleeping, a CI step timing
 * out, a container being reclaimed. A monolithic seeder that loses everything on
 * interruption is one you learn to run overnight and never again.
 *
 * So the phases are separately invocable — `--phase posts`, `--phase counters`,
 * `--phase search`, `--phase analyze` — and `all` runs them in order. It is the
 * same shape the importer (F85) and the recount (F38) already have, for the same
 * reason, and the standard applies to the tooling too.
 *
 * ## Why each phase exists at all
 *
 * Every one of them is a thing whose *absence* changes what gets measured, and
 * changes it in the flattering direction:
 *
 *  - **Counters.** `seedBoard` writes rows, not the denormalised counts the
 *    listings read. A board index over zeroed counters is a correct-looking page
 *    with none of the work in it.
 *  - **Search.** `search_vector` is filled by the write path, per post. A bulk
 *    insert leaves it null, and a null vector matches nothing — so the search
 *    scenarios would time an index lookup against an empty index.
 *  - **ANALYZE.** Postgres plans from statistics, and a freshly bulk-loaded
 *    table has none. Without it the planner sequential-scans two million rows
 *    for a query that has a perfectly good index, and the run measures a
 *    situation no real board is ever in — autovacuum would have fixed it minutes
 *    later. Skipping this is how a load test invents a crisis.
 */
const PHASES = ['posts', 'counters', 'search', 'analyze'] as const
type Phase = (typeof PHASES)[number]

async function seed(
  db: Database,
  scale: SeedScale,
  only: Phase | 'all',
): Promise<void> {
  const started = Date.now()
  const wanted = (phase: Phase): boolean => only === 'all' || only === phase

  if (wanted('posts')) {
    process.stdout.write(
      `Seeding ${scale.threads.toLocaleString()} threads across ${scale.forums} forums…\n`,
    )
    const board = await seedBoard(db, scale)
    process.stdout.write(
      `  ${board.postCount.toLocaleString()} posts in ${elapsed(started)}.\n`,
    )
  }

  if (wanted('counters')) {
    process.stdout.write('Reconciling counters…\n')
    const recount = new PostgresCounterRecount(db)
    let runs = 0
    for (;;) {
      const run = await recount.run(5_000)
      if (run.completedPass) break
      if (++runs > 100_000) throw new Error('recount did not converge')
    }
    process.stdout.write(`  done in ${elapsed(started)}.\n`)
  }

  if (wanted('search')) {
    process.stdout.write('Indexing for search…\n')
    const search = new PostgresSearchRepository(db)

    /*
     * Resumable by construction, not by bookkeeping: `reindexChunk` selects on
     * "no vector, or one built under an older document version" — a set that
     * shrinks monotonically, so a re-run after an interruption picks up exactly
     * what is left.
     */
    let cursor = 0
    for (;;) {
      const chunk = await search.reindexChunk(cursor, 20_000)
      if (chunk.nextCursor === null) break
      cursor = chunk.nextCursor
    }

    const progress = await search.indexProgress()
    if (progress.pending > 0) {
      throw new Error(
        `Search index incomplete: ${progress.pending} posts still unindexed.`,
      )
    }
    process.stdout.write(
      `  ${progress.indexed.toLocaleString()} posts indexed.\n`,
    )
  }

  if (wanted('analyze')) {
    process.stdout.write('Analysing…\n')
    await db.execute(sql`analyze`)
  }

  process.stdout.write(`Done in ${elapsed(started)}.\n`)
}

function elapsed(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`
}

/**
 * `full` is the plan's number and the only one whose results may be published.
 * `tenth` is for checking the harness works; `smoke` is for checking it runs.
 */
const SCALES: Record<string, SeedScale> = {
  full: FULL_SCALE,
  tenth: { ...FULL_SCALE, users: 2_000, threads: 10_000 },
  smoke: SMOKE_SCALE,
}

function argOf(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

/* ------------------------------------------------------------------ *
 * The board's landmarks
 * ------------------------------------------------------------------ */

interface Landmarks {
  /** The forum with the most threads — the one whose listing is slowest. */
  readonly busiestForumId: number
  /** The thread with the most posts. */
  readonly longestThreadId: number
  /** How many posts that thread has — the deep-page claim needs a real depth. */
  readonly longestThreadPosts: number
  /** Ids spread through the longest thread, for deep-page reads. */
  readonly deepPostIds: readonly number[]
  /** A spread of thread ids in the busiest forum, so the cache is not the test. */
  readonly threadIds: readonly number[]
  /** Cursors deep into the busiest forum's listing. */
  readonly forumCursors: readonly {
    readonly lastPostAt: Date
    readonly id: number
  }[]
  readonly memberIds: readonly number[]
  readonly forumIds: readonly number[]
  readonly viewerUserId: number
}

/**
 * Find the *worst* case rather than a typical one.
 *
 * A benchmark on an average thread measures an average thread, and the page that
 * falls over on a real board is the one with forty thousand posts in it. Every
 * landmark here is a maximum for that reason.
 */
async function findLandmarks(db: Database): Promise<Landmarks> {
  const [busiest] = await db
    .select({ id: schema.forums.id })
    .from(schema.forums)
    .where(eq(schema.forums.type, 'forum'))
    .orderBy(desc(schema.forums.threadCount))
    .limit(1)

  const [longest] = await db
    .select({ id: schema.threads.id })
    .from(schema.threads)
    .orderBy(desc(schema.threads.replyCount))
    .limit(1)

  const busiestForumId = busiest?.id
  const longestThreadId = longest?.id
  if (busiestForumId === undefined || longestThreadId === undefined) {
    throw new Error('No forums or threads. Run `pnpm perf seed` first.')
  }

  const postRows = await db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(eq(schema.posts.threadId, longestThreadId))
    .orderBy(schema.posts.id)

  const threadRows = await db
    .select({ id: schema.threads.id, lastPostAt: schema.threads.lastPostAt })
    .from(schema.threads)
    .where(eq(schema.threads.forumId, busiestForumId))
    .orderBy(desc(schema.threads.lastPostAt), desc(schema.threads.id))
    .limit(4_000)

  const userRows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .orderBy(desc(schema.users.postCount))
    .limit(200)

  const forumRows = await db
    .select({ id: schema.forums.id })
    .from(schema.forums)
    .where(eq(schema.forums.type, 'forum'))

  const viewerUserId = userRows[0]?.id
  if (viewerUserId === undefined)
    throw new Error('No users. Run `pnpm perf seed` first.')

  /*
   * Cursors come from the middle of each list, never the last page.
   *
   * `slice(0, -40)` is not tidiness: a cursor forty rows from the end returns a
   * short page, and a short page is a *cheaper* query. Sampling right up to the
   * end would mix full pages with partial ones and quietly pull the p95 down —
   * a benchmark that gets faster the closer it gets to the end of the data is
   * measuring how much data was left, not how fast the query is.
   */
  return {
    busiestForumId,
    longestThreadId,
    longestThreadPosts: postRows.length,
    /* Spread across the thread rather than clustered: every page is a different page. */
    deepPostIds: spread(postRows.slice(500, -40).map((r) => r.id)),
    threadIds: spread(threadRows.map((r) => r.id)),
    forumCursors: spread(threadRows.slice(200, -40)).map((r) => ({
      lastPostAt: r.lastPostAt as Date,
      id: r.id,
    })),
    memberIds: userRows.map((r) => r.id),
    forumIds: forumRows.map((r) => r.id),
    viewerUserId,
  }
}

/** Up to `count` evenly spaced items, so samples cover the whole range. */
function spread<T>(items: readonly T[], count = 64): T[] {
  if (items.length <= count) return [...items]
  const step = items.length / count
  return Array.from(
    { length: count },
    (_, i) => items[Math.floor(i * step)] as T,
  )
}

/* ------------------------------------------------------------------ *
 * The scenarios
 * ------------------------------------------------------------------ */

async function buildScenarios(
  db: Database,
  marks: Landmarks,
): Promise<Scenario[]> {
  const threads = new PostgresThreadRepository(db)
  const posts = new PostgresPostRepository(db)
  const forums = new PostgresForumRepository(db)
  const discovery = new PostgresDiscoveryRepository(db)
  const search = new PostgresSearchRepository(db)
  const profiles = new PostgresMemberProfileRepository(db)

  const authorizer = new Authorizer(new PostgresAuthorizationSource(db))
  const actor = await new ActorBuilder(db, { guestGroupId: 1 }).buildForUser(
    marks.viewerUserId,
  )
  if (actor === null)
    throw new Error('Could not build an actor for the seeded viewer.')

  const scope = PUBLIC_CONTENT
  const visibleForumIds = await authorizer.forumIdsWhere(actor, 'thread.view')
  const pick = <T>(items: readonly T[], i: number): T =>
    items[i % items.length] as T

  return [
    {
      id: 'thread-page-first',
      minRows: 20,
      run: async () => {
        const page = await posts.listThread(marks.longestThreadId, {
          limit: 20,
          scope,
        })
        return page.rows.length
      },
    },
    {
      id: 'thread-page-deep',
      minRows: 20,
      run: async (i) => {
        const page = await posts.listThread(marks.longestThreadId, {
          afterId: pick(marks.deepPostIds, i),
          limit: 20,
          scope,
        })
        return page.rows.length
      },
    },
    {
      id: 'forum-page-first',
      minRows: 20,
      run: async () => {
        const page = await threads.listForum(marks.busiestForumId, {
          limit: 20,
          scope,
        })
        return page.rows.length
      },
    },
    {
      id: 'forum-page-deep',
      minRows: 20,
      run: async (i) => {
        const cursor = pick(marks.forumCursors, i)
        const page = await threads.listForum(marks.busiestForumId, {
          after: {
            sort: 'activity',
            lastPostAt: cursor.lastPostAt,
            ratingTotal: 0,
            ratingCount: 0,
            id: cursor.id,
            isSticky: false,
          },
          limit: 20,
          scope,
        })
        return page.rows.length
      },
    },
    {
      id: 'board-index',
      minRows: 10,
      run: async () => (await forums.listListing()).length,
    },
    {
      id: 'visible-forums',
      minRows: 1,
      run: async () =>
        (await authorizer.forumIdsWhere(actor, 'thread.view')).length,
    },
    {
      id: 'discovery-latest',
      minRows: 20,
      run: async () => {
        /*
         * `activeSince` with a date early enough to match everything: the point
         * is the ordering scan across every visible forum, not the filter. A
         * recent cut-off would narrow the set and measure a much easier query
         * than the one a quiet board's "latest threads" actually runs.
         */
        const page = await discovery.activeSince(
          EPOCH,
          { limit: 20, after: null },
          {
            forumIds: visibleForumIds,
            content: scope,
            viewerUserId: marks.viewerUserId,
          },
        )
        return page.rows.length
      },
    },
    {
      id: 'search-common',
      minRows: 1,
      run: async (i) => {
        const results = await search.search(
          {
            terms: pick(COMMON_TERMS, i),
            grouping: 'posts',
            sort: 'relevance',
            limit: 20,
            after: null,
          },
          {
            forumIds: visibleForumIds,
            content: scope,
            viewerUserId: marks.viewerUserId,
          },
        )
        return results.hits.length
      },
    },
    {
      id: 'search-rare',
      minRows: 1,
      run: async (i) => {
        const results = await search.search(
          {
            terms: pick(RARE_TERMS, i),
            grouping: 'threads',
            sort: 'relevance',
            limit: 20,
            after: null,
          },
          {
            forumIds: visibleForumIds,
            content: scope,
            viewerUserId: marks.viewerUserId,
          },
        )
        return results.hits.length
      },
    },
    {
      id: 'member-profile',
      minRows: 1,
      run: async (i) => {
        const found = await profiles.findPublicById(pick(marks.memberIds, i))
        return found === null ? 0 : 1
      },
    },
  ]
}

/*
 * The seeder's vocabulary, split by how often each word appears. Both halves
 * matter: a fast rare-term search hides a slow common-term one, because the
 * index lookup is identical and only the number of rows to rank differs.
 */
const EPOCH = new Date('2000-01-01T00:00:00Z')

const COMMON_TERMS = ['thread', 'reply', 'server', 'question']

/*
 * `FULL_SCALE.rareTerm` — the one word the seeder injects into a fraction of a
 * percent of posts. Every other word in the corpus appears in nearly every
 * post, so without it "rare term" would be a synonym for "common term" and the
 * two search budgets would measure the same query twice.
 */
const RARE_TERMS = [FULL_SCALE.rareTerm?.word ?? 'quinsyflange']

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

function report(verdicts: readonly Verdict[]): boolean {
  const width = Math.max(...BUDGETS.map((b) => b.id.length))
  process.stdout.write('\n')

  for (const v of verdicts) {
    const mark = v.pass ? 'ok  ' : 'FAIL'
    const bar = `${(v.ratio * 100).toFixed(0)}% of budget`
    process.stdout.write(
      `  ${mark}  ${v.id.padEnd(width)}  p95 ${v.p95Ms.toFixed(1).padStart(7)}ms  ` +
        `budget ${String(v.budgetMs).padStart(4)}ms  ${bar}\n`,
    )
  }

  const failed = verdicts.filter((v) => !v.pass)
  process.stdout.write('\n')

  if (failed.length > 0) {
    process.stdout.write(
      `${failed.length} of ${verdicts.length} scenarios over budget.\n\n` +
        'A budget here is 2–3× the observed p95, so exceeding one is not noise: it is ' +
        'usually a missing index or a plan that changed. `explain (analyze, buffers)` on ' +
        'the query is the next step, not a raised number.\n',
    )
    return false
  }

  process.stdout.write(`All ${verdicts.length} scenarios within budget.\n`)
  return true
}

/* ------------------------------------------------------------------ *
 * Index plans (F28)
 * ------------------------------------------------------------------ */

/**
 * Run every declared plan and fail if the planner did not choose its index.
 *
 * `explain (analyze, buffers)` rather than a bare `explain`: an estimated plan
 * is the planner's opinion, and the question here is what it *did*. The row
 * counts come from the same run, which is what makes a scan obvious even when
 * it happens to be fast — a query that touched two million rows to return
 * twenty is a scan whatever the clock says.
 */
async function explainIndexes(db: Database, marks: Landmarks): Promise<number> {
  const results: PlanResult[] = []

  for (const plan of INDEX_PLANS) {
    const statement = plan.sql
      .replace(/\$1/g, String(marks.busiestForumId))
      .replace(/\$2/g, String(marks.longestThreadId))

    /*
     * Once to warm, once to record. The first execution of a statement pays for
     * a cold buffer cache and a plan that has not been made yet, and the timing
     * printed beside "ok" would otherwise be dominated by whichever query
     * happened to run first — 119ms for a query that costs 3ms warm, which reads
     * as a problem and is not one.
     */
    await db.execute(sql.raw(`explain (analyze) ${statement}`))

    const rows = resultRowsOf(
      await db.execute(sql.raw(`explain (analyze, buffers) ${statement}`)),
    )
    const text = rows
      .map((row) => String(Object.values(row)[0] ?? ''))
      .join('\n')

    const { used, chosen } = readPlan(text, plan.index)
    const ms = Number(/actual time=[\d.]+\.\.([\d.]+)/.exec(text)?.[1] ?? 0)
    const touched = [...text.matchAll(/rows=(\d+)/g)].map((m) => Number(m[1]))

    results.push({
      id: plan.id,
      index: plan.index,
      used,
      chosen,
      ms,
      rows: touched.length === 0 ? 0 : Math.max(...touched),
    })
  }

  const width = Math.max(...INDEX_PLANS.map((p) => p.id.length))
  process.stdout.write('\n')

  for (const result of results) {
    process.stdout.write(
      `  ${result.used ? 'ok  ' : 'FAIL'}  ${result.id.padEnd(width)}  ` +
        `${result.used ? result.index : `expected ${result.index}, planner chose ${result.chosen}`}` +
        `  (${result.ms.toFixed(1)}ms)\n`,
    )
  }

  const missed = results.filter((r) => !r.used)
  process.stdout.write('\n')

  if (missed.length > 0) {
    process.stderr.write(
      `${missed.length} of ${results.length} queries no longer use their index.\n\n` +
        'A partial index only matches a query whose predicate the planner can prove\n' +
        'implies it, so this is usually a read path that started passing a variable\n' +
        'visibility scope where it used to pass a literal. Nothing errors when that\n' +
        'happens — the page just becomes a sequential scan of the largest table.\n',
    )
    return 1
  }

  await writeFile(
    INDEX_FILE,
    `${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8',
  )
  process.stdout.write(
    `All ${results.length} queries use their index. Recorded to ${INDEX_FILE}.\n`,
  )
  return 0
}

const INDEX_FILE = new URL(
  '../../../../docs/perf-indexes.json',
  import.meta.url,
).pathname

/** `db.execute` shapes differ by driver; every read here goes through this. */
function resultRowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}

/* ------------------------------------------------------------------ *
 * Entry
 * ------------------------------------------------------------------ */

async function main(): Promise<number> {
  const command = process.argv[2] ?? 'measure'
  const db = getDb()

  if (command === 'seed') {
    /*
     * `--scale` exists so the harness itself can be exercised in a minute
     * instead of half an hour. Every bug in a load runner — a wrong id, an
     * empty scope, a scenario measuring nothing — shows up at any scale, and
     * finding them after a thirty-minute seed is how a harness gets abandoned.
     */
    const name = argOf('--scale') ?? 'full'
    const scale = SCALES[name]
    if (scale === undefined) {
      process.stderr.write(
        `Unknown scale "${name}". Use: ${Object.keys(SCALES).join(', ')}\n`,
      )
      return 2
    }
    const phase = (argOf('--phase') ?? 'all') as Phase | 'all'
    if (phase !== 'all' && !PHASES.includes(phase)) {
      process.stderr.write(
        `Unknown phase "${phase}". Use: all, ${PHASES.join(', ')}\n`,
      )
      return 2
    }

    await seed(db, scale, phase)
    return 0
  }

  if (command === 'explain') {
    const marks = await findLandmarks(db)
    return explainIndexes(db, marks)
  }

  if (command !== 'measure') {
    process.stderr.write(
      `Unknown command "${command}". Use: seed | measure | explain\n`,
    )
    return 2
  }

  const marks = await findLandmarks(db)
  const [counted] = await db
    .select({ posts: sql<number>`count(*)::int` })
    .from(schema.posts)
  const [countedThreads] = await db
    .select({ threads: sql<number>`count(*)::int` })
    .from(schema.threads)

  const postCount = counted?.posts ?? 0
  const threadCount = countedThreads?.threads ?? 0

  /*
   * The visibility mix is recorded because it is what makes the partial-index
   * evidence mean anything. On an all-visible board a partial index and its
   * unfiltered twin cover the same rows, so the planner may pick either and
   * "the index was used" is luck rather than proof.
   */
  const hidden = resultRowsOf(
    await db.execute(sql`
      select visibility, count(*)::int as n from posts group by visibility order by visibility
    `),
  ).map((row) => ({
    visibility: String(row.visibility),
    posts: Number(row.n),
  }))

  process.stdout.write(
    `Measuring against ${postCount.toLocaleString()} posts ` +
      `(${DEFAULT_MEASURE.iterations} iterations, ${DEFAULT_MEASURE.warmup} discarded).\n`,
  )

  const scenarios = await buildScenarios(db, marks)
  const verdicts: Verdict[] = []
  const measurements: Measurement[] = []

  for (const scenario of scenarios) {
    const budget = BUDGETS.find((b) => b.id === scenario.id)
    if (budget === undefined)
      throw new Error(`Scenario "${scenario.id}" has no budget.`)

    const measurement = await measure(scenario)
    if (measurement.underpowered) {
      throw new Error(
        `Scenario "${scenario.id}" ran too few iterations for a p95.`,
      )
    }
    measurements.push(measurement)
    verdicts.push(verdict(measurement, budget.p95Ms))
  }

  /*
   * Every budget must have been exercised. A scenario silently dropped would
   * leave a documented budget nothing measures — the exact failure this whole
   * arrangement exists to prevent.
   */
  const unmeasured = BUDGETS.filter((b) => !verdicts.some((v) => v.id === b.id))
  if (unmeasured.length > 0) {
    throw new Error(
      `No scenario for: ${unmeasured.map((b) => b.id).join(', ')}`,
    )
  }

  const passed = report(verdicts)

  /*
   * `--record` writes the run to disk, and `docs/performance.md` is generated
   * from that file rather than typed.
   *
   * The alternative — a person copying numbers into Markdown — is how a
   * performance document ends up describing a board that no longer exists.
   * Here the published figure and the measured figure are the same bytes, and
   * a run that was never done is a file that was never written.
   */
  if (process.argv.includes('--record')) {
    await writeFile(
      RESULTS_FILE,
      `${JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          postCount,
          threadCount,
          longestThreadPosts: marks.longestThreadPosts,
          visibility: hidden,
          iterations: DEFAULT_MEASURE.iterations,
          warmup: DEFAULT_MEASURE.warmup,
          environment: describeEnvironment(),
          results: measurements.map((m) => ({ id: m.id, ...m.summary })),
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    process.stdout.write(`\nRecorded to ${RESULTS_FILE}.\n`)
  }

  return passed ? 0 : 1
}

const RESULTS_FILE = new URL(
  '../../../../docs/perf-results.json',
  import.meta.url,
).pathname

/**
 * Enough about the machine to know whether two runs are comparable.
 *
 * Never the connection string, and never anything else from the environment: a
 * results file is committed, and a document generated from it is the last place
 * a database password should be able to reach.
 */
function describeEnvironment(): Record<string, string | number> {
  return {
    platform: `${process.platform}-${process.arch}`,
    node: process.version,
    cpus: cpus().length,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    memoryGb: Math.round(totalmem() / 1024 ** 3),
  }
}

process.exitCode = await main()
