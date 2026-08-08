/**
 * F56 — subscriptions over Postgres.
 *
 * Two tables that have existed since `0000`, written since F39 and read by
 * nothing until now. What this adds is the reader, and every interesting
 * decision in it is about **what a member is not told**.
 *
 * ## The pending read is one query per member, not one per subscription
 *
 * "What is outstanding" is a union of two ranges: posts newer than the
 * watermark in a thread I follow, and posts newer than the watermark in *any*
 * thread of a community I follow. Both halves are keyset ranges over
 * `posts (thread_id, id)`, which is the index the thread page already lives on.
 *
 * ## Visibility is filtered three ways, and all three are necessary
 *
 * - `visibleIn(..., PUBLIC_CONTENT)` on the post *and* its thread, through
 *   F47's one helper — a digest must never carry a held or soft-deleted post,
 *   and it is a background job with no reader whose moderator status could
 *   widen that.
 * - `community_id in (visible set)`, resolved per member through the Authorizer by
 *   the caller. A subscription is not a standing grant: a community can be made
 *   private after somebody subscribed to it.
 * - `author_user_id <> the subscriber`, because being told about your own reply
 *   is noise everybody notices and nobody wants.
 */
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT } from '@meith/core'
import type {
  DigestCadence,
  PendingForUser,
  SubscriptionMode,
  SubscriptionRepository,
  SubscriptionRow,
  SubscriptionTarget,
} from '@meith/subscriptions'
import { parseSubscriptionMode } from '@meith/subscriptions'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

/** `(null)` is a legal empty `in` list; `()` is a syntax error. */
function idList(ids: readonly number[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`(null)`
  return sql`(${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`
}

/** Which table a target lives in. Two narrow tables, one shape. */
interface TableShape {
  readonly table: ReturnType<typeof sql>
  readonly column: ReturnType<typeof sql>
}

function shapeFor(target: SubscriptionTarget): TableShape {
  return target === 'thread'
    ? { table: sql`thread_subscriptions`, column: sql`thread_id` }
    : { table: sql`community_subscriptions`, column: sql`community_id` }
}

/**
 * The two halves of "posts this member has not been told about".
 *
 * Written once and used by three callers (the pending read, the count on the
 * management screen, and the due-members scan) so they cannot disagree about
 * what "outstanding" means — D41's rule about one definition of a count,
 * applied to one definition of unread.
 */
function pendingPosts(
  userId: number,
  mode: SubscriptionMode | null,
  visibleCommunityIds: readonly number[] | null,
): ReturnType<typeof sql> {
  const byMode = mode === null ? sql`` : sql`and s.mode = ${mode}`
  const visible =
    visibleCommunityIds === null ? sql`` : sql`and t.community_id in ${idList(visibleCommunityIds)}`

  return sql`
    select p.id as post_id, p.thread_id, t.title as thread_title, t.slug as thread_slug,
           t.community_id, u.username as author_username, p.created_at,
           'thread'::text as target, s.thread_id as target_id
      from thread_subscriptions s
      join threads t on t.id = s.thread_id
      join posts p on p.thread_id = s.thread_id and p.id > s.last_notified_post_id
      left join users u on u.id = p.author_user_id
     where s.user_id = ${userId} ${byMode}
       and p.author_user_id is distinct from ${userId}
       and ${visibleIn(sql`p.visibility`, PUBLIC_CONTENT)}
       and ${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)}
       ${visible}

    union all

    select p.id as post_id, p.thread_id, t.title as thread_title, t.slug as thread_slug,
           t.community_id, u.username as author_username, p.created_at,
           'community'::text as target, s.community_id as target_id
      from community_subscriptions s
      join threads t on t.community_id = s.community_id
      join posts p on p.thread_id = t.id and p.id > s.last_notified_post_id
      left join users u on u.id = p.author_user_id
     where s.user_id = ${userId} ${byMode}
       and p.author_user_id is distinct from ${userId}
       and ${visibleIn(sql`p.visibility`, PUBLIC_CONTENT)}
       and ${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)}
       ${visible}
  `
}

interface RawPending {
  post_id: number
  thread_id: number
  thread_title: string
  thread_slug: string
  community_id: number
  author_username: string | null
  created_at: string | Date
  target: SubscriptionTarget
  target_id: number
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

export class PostgresSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: Database) {}

  /**
   * Subscribe, or change the cadence of an existing subscription.
   *
   * **The watermark is set from the target's current last post, and only on
   * insert.** Two failures follow from getting either half wrong: without the
   * initial value, following a 400-post thread produces a digest of 400 posts;
   * and resetting it on conflict would mark three unread replies as told the
   * moment somebody switched from daily to weekly.
   *
   * The existence check is part of the insert — `select … from threads where id
   * = $1` as the values source — so a subscription to a thread that does not
   * exist writes nothing rather than leaving a row pointing at nothing.
   */
  async subscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
    readonly mode: SubscriptionMode
    readonly at: Date
  }): Promise<boolean> {
    const rows = resultRows(
      input.target === 'thread'
        ? await this.db.execute(sql`
            insert into thread_subscriptions
                   (user_id, thread_id, mode, last_notified_post_id, created_at)
            select ${input.userId}, t.id, ${input.mode},
                   coalesce(t.last_post_id, 0), ${input.at}
              from threads t
             where t.id = ${input.targetId}
                on conflict (user_id, thread_id)
                do update set mode = excluded.mode
            returning user_id
          `)
        : await this.db.execute(sql`
            insert into community_subscriptions
                   (user_id, community_id, mode, last_notified_post_id, created_at)
            select ${input.userId}, f.id, ${input.mode},
                   coalesce(f.last_post_id, 0), ${input.at}
              from communities f
             where f.id = ${input.targetId}
                on conflict (user_id, community_id)
                do update set mode = excluded.mode
            returning user_id
          `),
    ) as Array<{ user_id: number }>

    return rows.length > 0
  }

  async unsubscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
  }): Promise<boolean> {
    const { table, column } = shapeFor(input.target)
    const rows = resultRows(
      await this.db.execute(sql`
        delete from ${table}
         where user_id = ${input.userId} and ${column} = ${input.targetId}
        returning user_id
      `),
    ) as Array<{ user_id: number }>

    return rows.length > 0
  }

  async modeFor(
    userId: number,
    target: SubscriptionTarget,
    targetId: number,
  ): Promise<SubscriptionMode | null> {
    const { table, column } = shapeFor(target)
    const rows = resultRows(
      await this.db.execute(sql`
        select mode from ${table}
         where user_id = ${userId} and ${column} = ${targetId}
      `),
    ) as Array<{ mode: string }>

    const stored = rows[0]?.mode
    /* Configuration outlives code: an unknown mode reads as no subscription. */
    return stored === undefined ? null : parseSubscriptionMode(stored)
  }

  /**
   * The management screen.
   *
   * The pending count comes from the same fragment the notifier uses, so the
   * number a member sees is the number they will be told about — and a community
   * they can no longer see is dropped entirely rather than shown with a count
   * of zero, which would still disclose that they once subscribed to something
   * now private.
   */
  async listFor(
    userId: number,
    options: { readonly visibleCommunityIds: readonly number[]; readonly limit: number },
  ): Promise<readonly SubscriptionRow[]> {
    const visible = idList(options.visibleCommunityIds)

    const rows = resultRows(
      await this.db.execute(sql`
        with pending as (
          select target, target_id, count(*)::int as pending
            from (${pendingPosts(userId, null, options.visibleCommunityIds)}) p
           group by target, target_id
        )
        select 'thread'::text as target, s.thread_id as target_id, t.title,
               t.slug, s.mode, s.created_at,
               coalesce(pending.pending, 0) as pending
          from thread_subscriptions s
          join threads t on t.id = s.thread_id
          left join pending
                 on pending.target = 'thread' and pending.target_id = s.thread_id
         where s.user_id = ${userId}
           and ${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)}
           and t.community_id in ${visible}

        union all

        select 'community'::text as target, s.community_id as target_id, f.title,
               f.slug, s.mode, s.created_at,
               coalesce(pending.pending, 0) as pending
          from community_subscriptions s
          join communities f on f.id = s.community_id
          left join pending
                 on pending.target = 'community' and pending.target_id = s.community_id
         where s.user_id = ${userId} and s.community_id in ${visible}

         order by created_at desc, target_id desc
         limit ${options.limit}
      `),
    ) as Array<{
      target: SubscriptionTarget
      target_id: number
      title: string
      slug: string
      mode: string
      created_at: string | Date
      pending: number
    }>

    return rows.map((row) => ({
      target: row.target,
      targetId: Number(row.target_id),
      title: row.title,
      href:
        row.target === 'thread'
          ? `/thread/${Number(row.target_id)}-${row.slug}`
          : `/${Number(row.target_id)}-${row.slug}`,
      mode: parseSubscriptionMode(row.mode) ?? 'instant',
      createdAt: toDate(row.created_at),
      pending: Number(row.pending),
    }))
  }

  /**
   * Members with something outstanding on this cadence.
   *
   * Two filters, and the second is the digest clock: a member is due when they
   * have never had a digest on this cadence *or* their last one predates the
   * interval. `dueBefore` is null for instant, which has no clock — it is due
   * whenever anything is pending.
   *
   * Deliberately **not** visibility-filtered. Doing that here would mean
   * resolving the Authorizer for every candidate before knowing whether they
   * have anything at all; the caller resolves it per member afterwards, and a
   * member whose pending posts all turn out to be invisible simply produces no
   * notification.
   */
  async usersWithPending(input: {
    readonly mode: SubscriptionMode
    readonly dueBefore: Date | null
    readonly limit: number
  }): Promise<readonly number[]> {
    const cadence = input.dueBefore === null ? null : input.mode
    const dueClause =
      input.dueBefore === null || cadence === null
        ? sql``
        : sql`
            and not exists (
              select 1 from digest_runs d
               where d.user_id = s.user_id and d.cadence = ${cadence}
                 and d.last_sent_at > ${input.dueBefore}
            )
          `

    const rows = resultRows(
      await this.db.execute(sql`
        select distinct s.user_id
          from (
            select user_id, thread_id as target_id, mode, last_notified_post_id,
                   'thread'::text as target
              from thread_subscriptions
             union all
            select user_id, community_id as target_id, mode, last_notified_post_id,
                   'community'::text as target
              from community_subscriptions
          ) s
         where s.mode = ${input.mode}
           and exists (
             select 1
               from threads t
               join posts p on p.thread_id = t.id and p.id > s.last_notified_post_id
              where (
                      (s.target = 'thread' and t.id = s.target_id)
                   or (s.target = 'community' and t.community_id = s.target_id)
                    )
                and p.author_user_id is distinct from s.user_id
                and ${visibleIn(sql`p.visibility`, PUBLIC_CONTENT)}
                and ${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)}
           )
           ${dueClause}
         order by s.user_id
         limit ${input.limit}
      `),
    ) as Array<{ user_id: number }>

    return rows.map((row) => Number(row.user_id))
  }

  async pendingFor(input: {
    readonly userId: number
    readonly mode: SubscriptionMode
    readonly visibleCommunityIds: readonly number[]
    readonly limit: number
  }): Promise<PendingForUser> {
    const rows = resultRows(
      await this.db.execute(sql`
        select * from (${pendingPosts(input.userId, input.mode, input.visibleCommunityIds)}) p
         order by p.thread_id, p.post_id
         limit ${input.limit}
      `),
    ) as RawPending[]

    /*
     * The watermark per subscription is the highest post id *this run actually
     * looked at*, which is why it is computed from the rows returned rather
     * than from the target's current last post: a run capped at
     * `MAX_POSTS_PER_USER` must resume where it stopped, not skip the rest.
     */
    const highest = new Map<string, { target: SubscriptionTarget; targetId: number; lastPostId: number }>()
    for (const row of rows) {
      const key = `${row.target}:${row.target_id}`
      const current = highest.get(key)
      const postId = Number(row.post_id)
      if (current === undefined || postId > current.lastPostId) {
        highest.set(key, {
          target: row.target,
          targetId: Number(row.target_id),
          lastPostId: postId,
        })
      }
    }

    /*
     * A post can be pending through both a thread subscription and its community's.
     * The rows are deduplicated by post so the member is told once; both
     * watermarks still advance, so neither subscription re-delivers it.
     */
    const seen = new Set<number>()
    const posts = []
    for (const row of rows) {
      const postId = Number(row.post_id)
      if (seen.has(postId)) continue
      seen.add(postId)
      posts.push({
        postId,
        threadId: Number(row.thread_id),
        threadTitle: row.thread_title,
        threadSlug: row.thread_slug,
        communityId: Number(row.community_id),
        authorUsername: row.author_username,
        createdAt: toDate(row.created_at),
      })
    }

    return { userId: input.userId, posts, watermarks: [...highest.values()] }
  }

  async advanceWatermarks(input: {
    readonly userId: number
    readonly watermarks: PendingForUser['watermarks']
  }): Promise<void> {
    if (input.watermarks.length === 0) return

    await this.db.transaction(async (tx) => {
      for (const mark of input.watermarks) {
        const { table, column } = shapeFor(mark.target)
        /*
         * `greatest` rather than a plain assignment: two runs racing, or a
         * subscription that was advanced by the instant task while a digest was
         * being assembled, must never move a watermark *backwards* — which
         * would re-deliver everything in between.
         */
        await tx.execute(sql`
          update ${table}
             set last_notified_post_id = greatest(last_notified_post_id, ${mark.lastPostId})
           where user_id = ${input.userId} and ${column} = ${mark.targetId}
        `)
      }
    })
  }

  async recordDigestRun(input: {
    readonly userId: number
    readonly cadence: DigestCadence
    readonly at: Date
  }): Promise<void> {
    await this.db.execute(sql`
      insert into digest_runs (user_id, cadence, last_sent_at)
      values (${input.userId}, ${input.cadence}, ${input.at})
          on conflict (user_id, cadence)
          do update set last_sent_at = excluded.last_sent_at
    `)
  }
}
