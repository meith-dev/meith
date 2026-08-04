/**
 * Postgres implementations of the ban ports (F23).
 *
 * Every write here is a transaction, and that is the point rather than a
 * flourish. Banning is four changes that only mean something together — record
 * the ban, capture the group being left, move the user, kill their sessions —
 * and any partial application is worse than no ban at all:
 *
 *  - row written, sessions left alive → not a ban, just a label;
 *  - group moved, previous group not captured → the restore-on-expiry
 *    guarantee is unkeepable and the user is stranded permanently;
 *  - sessions killed, group not moved → a logout the user simply undoes.
 */
import { and, asc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm'

import type { BanFilter, BanFilterType } from '@meith/accounts'
import type {
  BanFilterRepository,
  BanRecord,
  BanRepository,
  CreateBanInput,
} from '@meith/accounts'

import type { Database } from './client'
import { banFilters, bans, sessions, users } from './schema'

const BAN_COLUMNS = {
  id: bans.id,
  userId: bans.userId,
  reason: bans.reason,
  publicReason: bans.publicReason,
  previousPrimaryGroupId: bans.previousPrimaryGroupId,
  expiresAt: bans.expiresAt,
  liftedAt: bans.liftedAt,
} as const

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Restore the group captured when the ban was created, and mark it lifted. */
async function liftWithin(tx: Tx, ban: BanRecord, now: Date): Promise<void> {
  await tx.update(bans).set({ liftedAt: now }).where(eq(bans.id, ban.id))

  /*
   * `previousPrimaryGroupId` may legitimately be null — the referencing column
   * is ON DELETE SET NULL, so a group deleted while someone was banned leaves
   * nothing to restore. Writing null back would violate the NOT NULL on
   * `users.primary_group_id`, so the move is skipped and the user keeps the
   * banned group until an administrator intervenes. That is the safe direction:
   * the alternative is guessing a group and silently granting it.
   */
  if (ban.previousPrimaryGroupId !== null) {
    await tx
      .update(users)
      .set({
        primaryGroupId: ban.previousPrimaryGroupId,
        displayGroupId: ban.previousPrimaryGroupId,
      })
      .where(eq(users.id, ban.userId))
  }
}

export class PostgresBanRepository implements BanRepository {
  constructor(private readonly db: Database) {}

  async findActive(userId: number): Promise<BanRecord | null> {
    const rows = await this.db
      .select(BAN_COLUMNS)
      .from(bans)
      .where(and(eq(bans.userId, userId), isNull(bans.liftedAt)))
      .limit(1)

    return rows[0] ?? null
  }

  async create(input: CreateBanInput): Promise<BanRecord> {
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({
          /*
           * F20: this reads the group in order to *remember* it, which is what
           * makes restore-on-expiry possible. No access decision is made from
           * the value — it is written back verbatim when the ban lifts.
           */
          // eslint-disable-next-line no-restricted-properties -- F20: capturing the group being left, not deciding access
          primaryGroupId: users.primaryGroupId,
        })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1)

      if (!target) throw new Error(`Cannot ban unknown user ${input.userId}`)

      const [row] = await tx
        .insert(bans)
        .values({
          userId: input.userId,
          bannedByUserId: input.bannedByUserId,
          reason: input.reason,
          publicReason: input.publicReason,
          // Captured before the move below — this value is the entire
          // restore-on-expiry mechanism.
          // eslint-disable-next-line no-restricted-properties -- F20: remembering the group, not deciding access
          previousPrimaryGroupId: target.primaryGroupId,
          expiresAt: input.expiresAt,
          createdAt: input.now,
        })
        .returning(BAN_COLUMNS)

      await tx
        .update(users)
        .set({ primaryGroupId: input.bannedGroupId, displayGroupId: input.bannedGroupId })
        .where(eq(users.id, input.userId))

      // A ban that leaves the session alive is a label, not a ban.
      await tx
        .update(sessions)
        .set({ revokedAt: input.now })
        .where(and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt)))

      return row as BanRecord
    })
  }

  async lift(banId: number, now: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [ban] = await tx
        .select(BAN_COLUMNS)
        .from(bans)
        .where(and(eq(bans.id, banId), isNull(bans.liftedAt)))
        .limit(1)

      if (!ban) return
      await liftWithin(tx, ban, now)
    })
  }

  /**
   * The `expire-bans` task's write half.
   *
   * Bounded by `limit` (invariant 18) and ordered oldest-expiry-first so a
   * backlog drains in the order it accrued rather than starving the oldest
   * bans. Each user's restore targets their *own* captured group, which is why
   * this is a loop rather than one bulk UPDATE — the value differs per row.
   */
  async expireDue(now: Date, limit: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select(BAN_COLUMNS)
        .from(bans)
        .where(
          and(isNull(bans.liftedAt), isNotNull(bans.expiresAt), lte(bans.expiresAt, now)),
        )
        .orderBy(asc(bans.expiresAt))
        .limit(limit)
        // Two overlapping ticks must not both lift the same ban and both count
        // it; the loser skips the locked rows rather than blocking.
        .for('update', { skipLocked: true })

      for (const ban of due) await liftWithin(tx, ban, now)

      /*
       * A group change has to retire every resolved Actor, or a lifted ban
       * leaves the user holding banned-group permissions for the cache's
       * lifetime — i.e. the ban silently outlives its expiry.
       */
      if (due.length > 0) {
        await tx.execute(sql`
          insert into cache_versions (key, version)
          values ('permissions', 1)
          on conflict (key) do update set version = cache_versions.version + 1, bumped_at = now()
        `)
      }

      return due.length
    })
  }
}

export class PostgresBanFilterRepository implements BanFilterRepository {
  constructor(private readonly db: Database) {}

  /**
   * Every filter, unfiltered by type.
   *
   * The set is small (tens of rows on a busy board) and is read on every
   * registration and login, so it is one query rather than one per type — and
   * it is a natural thing to cache once F10's tags cover it.
   */
  async listAll(): Promise<readonly BanFilter[]> {
    const rows = await this.db
      .select({ id: banFilters.id, type: banFilters.type, pattern: banFilters.pattern })
      .from(banFilters)

    return rows.map((r) => ({ id: r.id, type: r.type as BanFilterType, pattern: r.pattern }))
  }
}
