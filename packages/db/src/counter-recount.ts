/**
 * F38 — the recount, in bounded resumable batches.
 *
 * Every denormalised counter on the board is maintained incrementally on the
 * write path because reading the truth costs a scan. Incremental maintenance
 * drifts: a crashed request, an import, a moderator action from a version that
 * missed a case. So each counter also has a way back to the truth, and this is
 * it — it writes a *computed* value rather than a delta, which is what makes it
 * idempotent and safe to interrupt.
 *
 * Two constraints shape the shape it has:
 *
 *   - It must run inside a serverless invocation, so a run is bounded by batch
 *     size and never by "until finished" (invariant 18). At the 2M-post target
 *     a full sweep is thousands of runs.
 *   - It must therefore be resumable, so where it got to lives in
 *     `counter_recount_state` rather than in the process.
 *
 * The phases are ordered threads → forums → users deliberately. Forum totals
 * are aggregated from the same post rows the thread phase reads, so running
 * threads first means a single sweep leaves the two consistent with each other
 * rather than one sweep behind.
 */
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

export const RECOUNT_PHASES = ['threads', 'forums', 'users'] as const
export type RecountPhase = (typeof RECOUNT_PHASES)[number]

export interface RecountRun {
  readonly phase: RecountPhase
  /** Rows examined in this run. Less than the batch size means phase complete. */
  readonly scanned: number
  /** Rows whose stored counters disagreed with the truth and were rewritten. */
  readonly corrected: number
  /** Where the next run resumes. */
  readonly cursor: number
  readonly nextPhase: RecountPhase
  /** True when this run finished the last phase, completing a full sweep. */
  readonly completedPass: boolean
}

interface PhaseState {
  phase: RecountPhase
  cursor: number
  passes: number
  corrected: number
}

function nextPhase(phase: RecountPhase): RecountPhase {
  const index = RECOUNT_PHASES.indexOf(phase)
  return RECOUNT_PHASES[(index + 1) % RECOUNT_PHASES.length]!
}

export class PostgresCounterRecount {
  constructor(
    private readonly db: Database,
    private readonly stateId = 'default',
  ) {}

  /**
   * Recount one bounded batch and record where to resume.
   *
   * Returns the run's shape rather than just a number so the task log can say
   * which phase is in progress — "corrected 0" is reassuring only when an
   * operator can see the sweep is still moving.
   */
  async run(batchSize = 500): Promise<RecountRun> {
    const state = await this.loadState()

    const batch = await this.scan(state.phase, state.cursor, batchSize)
    const corrected =
      batch.ids.length === 0 ? 0 : await this.correct(state.phase, state.cursor, batchSize)

    /*
     * A short batch means the phase has reached the end of its table. Advancing
     * on "short" rather than on "empty" saves one wasted run per phase, and the
     * cost of being wrong is nil: the next sweep re-reads whatever was inserted
     * behind the cursor, and re-reading is free of side effects by design.
     */
    const phaseComplete = batch.ids.length < batchSize
    const phase = phaseComplete ? nextPhase(state.phase) : state.phase
    const cursor = phaseComplete ? 0 : batch.maxId
    const completedPass = phaseComplete && state.phase === RECOUNT_PHASES[RECOUNT_PHASES.length - 1]

    await this.db.execute(sql`
      update counter_recount_state
         set phase = ${phase},
             cursor = ${cursor},
             passes = ${state.passes + (completedPass ? 1 : 0)},
             corrected = ${state.corrected + corrected},
             updated_at = now()
       where id = ${this.stateId}
    `)

    return {
      phase: state.phase,
      scanned: batch.ids.length,
      corrected,
      cursor,
      nextPhase: phase,
      completedPass,
    }
  }

  /** Current resume point. Exposed for the CLI and F70's health screen. */
  async state(): Promise<PhaseState> {
    return this.loadState()
  }

  private async loadState(): Promise<PhaseState> {
    await this.db.execute(sql`
      insert into counter_recount_state (id) values (${this.stateId})
      on conflict (id) do nothing
    `)

    const rows = resultRows(
      await this.db.execute(sql`
        select phase, cursor, passes, corrected
          from counter_recount_state where id = ${this.stateId}
      `),
    ) as Array<{ phase: string; cursor: number; passes: number; corrected: number }>

    const row = rows[0]
    const phase = RECOUNT_PHASES.find((p) => p === row?.phase) ?? 'threads'
    return {
      phase,
      cursor: Number(row?.cursor ?? 0),
      passes: Number(row?.passes ?? 0),
      corrected: Number(row?.corrected ?? 0),
    }
  }

  /**
   * The ids this run covers.
   *
   * Read separately from the correction so a run reports what it *examined*,
   * not only what was wrong — a recount that corrects nothing must still be
   * distinguishable from one that scanned nothing. Rows inserted concurrently
   * always take a higher id than `maxId`, so re-running the same window cannot
   * skip them.
   */
  private async scan(
    phase: RecountPhase,
    cursor: number,
    batchSize: number,
  ): Promise<{ ids: number[]; maxId: number }> {
    const table = { threads: sql`threads`, forums: sql`forums`, users: sql`users` }[phase]
    const rows = resultRows(
      await this.db.execute(sql`
        select id from ${table} where id > ${cursor} order by id limit ${batchSize}
      `),
    ) as Array<{ id: number }>

    const ids = rows.map((r) => Number(r.id))
    return { ids, maxId: ids.length === 0 ? cursor : Math.max(...ids) }
  }

  private async correct(
    phase: RecountPhase,
    cursor: number,
    batchSize: number,
  ): Promise<number> {
    if (phase === 'threads') return this.correctThreads(cursor, batchSize)
    if (phase === 'forums') return this.correctForums(cursor, batchSize)
    return this.correctUsers(cursor, batchSize)
  }

  /**
   * Thread counters from the thread's own visible posts.
   *
   * `reply_count` excludes the opening post, which is why it is one less than
   * the post count and floors at zero: a thread whose only post was deleted
   * still exists, and a negative reply count would render as one.
   */
  private async correctThreads(cursor: number, batchSize: number): Promise<number> {
    const result = await this.db.execute(sql`
      with batch as (
        select id, created_at from threads where id > ${cursor} order by id limit ${batchSize}
      ),
      agg as (
        select b.id,
               b.created_at,
               count(p.id)::int as post_count,
               min(p.id) as first_post_id,
               max(p.id) as last_post_id
          from batch b
          left join posts p on p.thread_id = b.id and p.visibility = 'visible'
         group by b.id, b.created_at
      ),
      truth as (
        select a.id,
               greatest(a.post_count - 1, 0) as reply_count,
               a.first_post_id,
               a.last_post_id,
               lp.author_user_id as last_post_user_id,
               lp.author_username as last_post_username,
               coalesce(lp.created_at, a.created_at) as last_post_at
          from agg a
          left join posts lp on lp.id = a.last_post_id
      )
      update threads t
         set reply_count = truth.reply_count,
             first_post_id = truth.first_post_id,
             last_post_id = truth.last_post_id,
             last_post_user_id = truth.last_post_user_id,
             last_post_username = truth.last_post_username,
             last_post_at = truth.last_post_at,
             updated_at = now()
        from truth
       where t.id = truth.id
         and (t.reply_count is distinct from truth.reply_count
           or t.first_post_id is distinct from truth.first_post_id
           or t.last_post_id is distinct from truth.last_post_id
           or t.last_post_user_id is distinct from truth.last_post_user_id
           or t.last_post_username is distinct from truth.last_post_username
           or t.last_post_at is distinct from truth.last_post_at)
      returning t.id
    `)

    return resultRows(result).length
  }

  /**
   * Forum counters over the whole subtree.
   *
   * Forum totals are subtree-inclusive — a category's row on the index counts
   * everything beneath it — so the truth for a forum is aggregated over itself
   * plus every descendant, matched by path prefix *with the separator*: without
   * the trailing dot, `1.4` also matches `1.40` and a sibling's posts land in
   * the wrong category (D22).
   *
   * Posts in a soft-deleted thread do not count, which is the one place this
   * differs from the incremental writer: the writer only ever sees new content,
   * where the two definitions agree.
   */
  private async correctForums(cursor: number, batchSize: number): Promise<number> {
    const result = await this.db.execute(sql`
      with batch as (
        select id, path from forums where id > ${cursor} order by id limit ${batchSize}
      ),
      subtree as (
        select b.id as root_id, d.id as forum_id
          from batch b
          join forums d on d.id = b.id or d.path like b.path || '.%'
      ),
      thread_agg as (
        select s.root_id, count(*)::int as thread_count
          from subtree s
          join threads th on th.forum_id = s.forum_id and th.visibility = 'visible'
         group by s.root_id
      ),
      post_agg as (
        select s.root_id, count(*)::int as post_count
          from subtree s
          join posts p on p.forum_id = s.forum_id and p.visibility = 'visible'
          join threads th on th.id = p.thread_id and th.visibility = 'visible'
         group by s.root_id
      ),
      last_agg as (
        select distinct on (s.root_id)
               s.root_id, p.id, p.thread_id, th.title, p.author_user_id,
               p.author_username, p.created_at
          from subtree s
          join posts p on p.forum_id = s.forum_id and p.visibility = 'visible'
          join threads th on th.id = p.thread_id and th.visibility = 'visible'
         order by s.root_id, p.created_at desc, p.id desc
      )
      update forums f
         set thread_count = coalesce(ta.thread_count, 0),
             post_count = coalesce(pa.post_count, 0),
             last_post_id = la.id,
             last_post_thread_id = la.thread_id,
             last_post_thread_title = la.title,
             last_post_user_id = la.author_user_id,
             last_post_username = la.author_username,
             last_post_at = la.created_at,
             updated_at = now()
        from batch b
             left join thread_agg ta on ta.root_id = b.id
             left join post_agg pa on pa.root_id = b.id
             left join last_agg la on la.root_id = b.id
       where f.id = b.id
         and (f.thread_count is distinct from coalesce(ta.thread_count, 0)
           or f.post_count is distinct from coalesce(pa.post_count, 0)
           or f.last_post_id is distinct from la.id
           or f.last_post_thread_id is distinct from la.thread_id
           or f.last_post_thread_title is distinct from la.title
           or f.last_post_user_id is distinct from la.author_user_id
           or f.last_post_username is distinct from la.author_username
           or f.last_post_at is distinct from la.created_at)
      returning f.id
    `)

    return resultRows(result).length
  }

  /**
   * Per-user totals.
   *
   * Counted from authored rows rather than from a running total, so a user
   * whose posts were deleted loses the count — which is what promotions (F24)
   * and postbit both claim to be showing.
   *
   * A visible post inside a soft-deleted thread does not count, for the same
   * reason it does not count towards its forum: the whole thread is gone from
   * the board, and leaving its posts on their authors' totals would mean a
   * moderator deleting a thread silently leaves every participant's count
   * higher than the posts anyone can find.
   */
  private async correctUsers(cursor: number, batchSize: number): Promise<number> {
    const result = await this.db.execute(sql`
      with batch as (
        select id from users where id > ${cursor} order by id limit ${batchSize}
      ),
      -- FILTER, not WHERE: a user whose every post sits in a deleted thread
      -- must still appear in this aggregate with a count of zero. Moving the
      -- predicate into the WHERE clause drops their row entirely, and the
      -- update would then leave exactly the stale count this is meant to fix.
      post_agg as (
        select b.id,
               (count(p.id) filter (where pt.visibility = 'visible'))::int as post_count
          from batch b
          left join posts p on p.author_user_id = b.id and p.visibility = 'visible'
          left join threads pt on pt.id = p.thread_id
         group by b.id
      ),
      thread_agg as (
        select b.id, count(th.id)::int as thread_count
          from batch b
          left join threads th on th.author_user_id = b.id and th.visibility = 'visible'
         group by b.id
      )
      update users u
         set post_count = pa.post_count,
             thread_count = ta.thread_count,
             updated_at = now()
        from post_agg pa
             join thread_agg ta on ta.id = pa.id
       where u.id = pa.id
         and (u.post_count is distinct from pa.post_count
           or u.thread_count is distinct from ta.thread_count)
      returning u.id
    `)

    return resultRows(result).length
  }
}
