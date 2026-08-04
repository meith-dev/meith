/**
 * Postgres implementation of `PromotionRepository` (F24).
 *
 * The rules and the safety guards live in `@meith/groups`; this only reads
 * candidates and applies decisions that have already been made.
 */
import { asc, gt, sql } from 'drizzle-orm'

import type {
  PromotionCandidate,
  PromotionOutcome,
  PromotionRepository,
  PromotionRule,
} from '@meith/groups'

import type { Database } from './client'
import { groupPromotions, users } from './schema'

/** `null` in a criterion column means "no constraint", not "zero". */
function optionalNumber(value: number | null): number | undefined {
  return value === null ? undefined : value
}

export class PostgresPromotionRepository implements PromotionRepository {
  constructor(private readonly db: Database) {}

  async listRules(): Promise<readonly PromotionRule[]> {
    const rows = await this.db
      .select()
      .from(groupPromotions)
      .orderBy(asc(groupPromotions.displayOrder), asc(groupPromotions.id))

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      enabled: r.enabled,
      displayOrder: r.displayOrder,
      minPostCount: optionalNumber(r.minPostCount),
      minReputation: optionalNumber(r.minReputation),
      minDaysRegistered: optionalNumber(r.minDaysRegistered),
      fromPrimaryGroupId: r.fromPrimaryGroupId,
      toPrimaryGroupId: r.toPrimaryGroupId,
    }))
  }

  /**
   * A page of users, keyed on id.
   *
   * Keyset paging rather than OFFSET because applying a promotion *changes the
   * rows being paged*. With OFFSET, moving a user shifts every later row up one
   * and the next page silently skips somebody — a bug that shows as "some
   * people never get promoted" and is almost impossible to reproduce by hand.
   */
  async candidates(afterUserId: number, limit: number): Promise<readonly PromotionCandidate[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        postCount: users.postCount,
        reputation: users.reputation,
        registeredAt: users.createdAt,
        // eslint-disable-next-line no-restricted-properties -- F20: reading the group to decide whether a rule applies to it, not granting anything
        primaryGroupId: users.primaryGroupId,
      })
      .from(users)
      .where(gt(users.id, afterUserId))
      .orderBy(asc(users.id))
      .limit(limit)

    return rows
  }

  /**
   * Apply a batch, and retire resolved actors once for the whole batch.
   *
   * One transaction: a half-applied batch leaves some users moved with no cache
   * invalidation, so they hold their old permissions while appearing promoted.
   * The `permission_version` bump is per batch rather than per user — it is a
   * global counter, so bumping it 500 times would be 499 wasted writes.
   */
  async applyPromotions(outcomes: readonly PromotionOutcome[]): Promise<void> {
    if (outcomes.length === 0) return

    await this.db.transaction(async (tx) => {
      /*
       * One statement for the whole batch via a VALUES join, not one UPDATE per
       * user: a promotion run on a large board can move thousands of people,
       * and per-row round trips inside a transaction on a pooled connection is
       * where that turns from seconds into minutes.
       */
      const values = sql.join(
        outcomes.map((o) => sql`(${o.userId}::int, ${o.toPrimaryGroupId}::int)`),
        sql`, `,
      )

      await tx.execute(sql`
        update ${users} as u
        set primary_group_id = v.group_id, display_group_id = v.group_id
        from (values ${values}) as v(user_id, group_id)
        where u.id = v.user_id
      `)

      await tx.execute(sql`
        insert into cache_versions (key, version)
        values ('permissions', 1)
        on conflict (key) do update set version = cache_versions.version + 1, bumped_at = now()
      `)
    })
  }
}
