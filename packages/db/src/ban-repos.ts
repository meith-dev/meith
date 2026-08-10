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

async function liftWithin(tx: Tx, ban: BanRecord, now: Date): Promise<void> {
  await tx.update(bans).set({ liftedAt: now }).where(eq(bans.id, ban.id))

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
          // eslint-disable-next-line no-restricted-properties -- capturing the group being left, not deciding access
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
          // eslint-disable-next-line no-restricted-properties -- remembering the group, not deciding access
          previousPrimaryGroupId: target.primaryGroupId,
          expiresAt: input.expiresAt,
          createdAt: input.now,
        })
        .returning(BAN_COLUMNS)

      await tx
        .update(users)
        .set({ primaryGroupId: input.bannedGroupId, displayGroupId: input.bannedGroupId })
        .where(eq(users.id, input.userId))

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
        .for('update', { skipLocked: true })

      for (const ban of due) await liftWithin(tx, ban, now)

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

  async listAll(): Promise<readonly BanFilter[]> {
    const rows = await this.db
      .select({ id: banFilters.id, type: banFilters.type, pattern: banFilters.pattern })
      .from(banFilters)

    return rows.map((r) => ({ id: r.id, type: r.type as BanFilterType, pattern: r.pattern }))
  }
}
