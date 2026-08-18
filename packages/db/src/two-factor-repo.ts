import { and, count, desc, eq, isNull, lt, sql } from 'drizzle-orm'

import type {
  AuthEventKind,
  AuthEventRecord,
  AuthEventRepository,
  NewAuthEvent,
  RecoveryCodeRepository,
  TwoFactorRecord,
  TwoFactorRepository,
} from '@meith/accounts'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { authEvents, recoveryCodes, userTwoFactor } from './schema'

const TWO_FACTOR_COLUMNS = {
  userId: userTwoFactor.userId,
  sealedSecret: userTwoFactor.sealedSecret,
  confirmedAt: userTwoFactor.confirmedAt,
  lastStep: userTwoFactor.lastStep,
  createdAt: userTwoFactor.createdAt,
} as const

export class PostgresTwoFactorRepository implements TwoFactorRepository {
  constructor(private readonly db: Database) {}

  async find(userId: number): Promise<TwoFactorRecord | null> {
    const rows = await this.db
      .select(TWO_FACTOR_COLUMNS)
      .from(userTwoFactor)
      .where(eq(userTwoFactor.userId, userId))
      .limit(1)
    return rows[0] ?? null
  }

  async startEnrolment(input: {
    userId: number
    sealedSecret: string
    now: Date
  }): Promise<TwoFactorRecord> {
    const rows = await this.db
      .insert(userTwoFactor)
      .values({
        userId: input.userId,
        sealedSecret: input.sealedSecret,
        confirmedAt: null,
        lastStep: null,
        createdAt: input.now,
      })
      .onConflictDoUpdate({
        target: userTwoFactor.userId,
        set: {
          sealedSecret: input.sealedSecret,
          confirmedAt: null,
          lastStep: null,
          createdAt: input.now,
        },
        setWhere: isNull(userTwoFactor.confirmedAt),
      })
      .returning(TWO_FACTOR_COLUMNS)

    const record = rows[0] ?? (await this.find(input.userId))
    if (record === null || record === undefined) {
      throw new Error('the two-factor enrolment vanished between insert and read')
    }
    return record
  }

  async confirm(userId: number, step: number, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(userTwoFactor)
      .set({ confirmedAt: now, lastStep: step })
      .where(and(eq(userTwoFactor.userId, userId), isNull(userTwoFactor.confirmedAt)))
      .returning({ userId: userTwoFactor.userId })
    return rows.length > 0
  }

  async spendStep(userId: number, step: number): Promise<boolean> {
    const rows = await this.db
      .update(userTwoFactor)
      .set({ lastStep: step })
      .where(
        and(
          eq(userTwoFactor.userId, userId),
          sql`(${userTwoFactor.lastStep} is null or ${userTwoFactor.lastStep} < ${step})`,
        ),
      )
      .returning({ userId: userTwoFactor.userId })
    return rows.length > 0
  }

  async remove(userId: number): Promise<boolean> {
    const rows = await this.db
      .delete(userTwoFactor)
      .where(eq(userTwoFactor.userId, userId))
      .returning({ userId: userTwoFactor.userId })
    return rows.length > 0
  }
}

export class PostgresRecoveryCodeRepository implements RecoveryCodeRepository {
  constructor(private readonly db: Database) {}

  async replaceAll(userId: number, hashes: readonly string[], now: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId))

      if (hashes.length === 0) return

      await tx
        .insert(recoveryCodes)
        .values(hashes.map((codeHash) => ({ userId, codeHash, createdAt: now })))
    })
  }

  async spend(userId: number, hash: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(recoveryCodes)
      .set({ usedAt: now })
      .where(
        and(
          eq(recoveryCodes.userId, userId),
          eq(recoveryCodes.codeHash, hash),
          isNull(recoveryCodes.usedAt),
        ),
      )
      .returning({ id: recoveryCodes.id })
    return rows.length > 0
  }

  async countUnused(userId: number): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)))
    return Number(rows[0]?.total ?? 0)
  }

  async removeAll(userId: number): Promise<void> {
    await this.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId))
  }
}

const EVENT_COLUMNS = {
  id: authEvents.id,
  userId: authEvents.userId,
  kind: authEvents.kind,
  ipPrefix: authEvents.ipPrefix,
  userAgent: authEvents.userAgent,
  detail: authEvents.detail,
  at: authEvents.at,
} as const

function toEvent(row: {
  id: number
  userId: number | null
  kind: string
  ipPrefix: string | null
  userAgent: string | null
  detail: unknown
  at: Date
}): AuthEventRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as AuthEventKind,
    ipPrefix: row.ipPrefix,
    userAgent: row.userAgent,
    detail:
      typeof row.detail === 'object' && row.detail !== null
        ? (row.detail as Record<string, unknown>)
        : {},
    at: row.at,
  }
}

export class PostgresAuthEventRepository implements AuthEventRepository {
  constructor(private readonly db: Database) {}

  async record(event: NewAuthEvent): Promise<void> {
    await this.db.insert(authEvents).values({
      userId: event.userId,
      kind: event.kind,
      ipPrefix: event.ipPrefix ?? null,
      userAgent: event.userAgent ?? null,
      detail: event.detail ?? {},
      at: event.at,
    })
  }

  async listForUser(userId: number, limit: number): Promise<readonly AuthEventRecord[]> {
    const rows = await this.db
      .select(EVENT_COLUMNS)
      .from(authEvents)
      .where(eq(authEvents.userId, userId))
      .orderBy(desc(authEvents.id))
      .limit(limit)
    return rows.map(toEvent)
  }

  async listRecent(input: {
    limit: number
    before?: number | undefined
    kind?: AuthEventKind | undefined
  }): Promise<readonly AuthEventRecord[]> {
    const filters = [
      input.before === undefined ? undefined : lt(authEvents.id, input.before),
      input.kind === undefined ? undefined : eq(authEvents.kind, input.kind),
    ].filter((filter) => filter !== undefined)

    const rows = await this.db
      .select(EVENT_COLUMNS)
      .from(authEvents)
      .where(filters.length === 0 ? undefined : and(...filters))
      .orderBy(desc(authEvents.id))
      .limit(input.limit)
    return rows.map(toEvent)
  }

  async pruneBefore(cutoff: Date, limit = 5000): Promise<number> {
    const result = await this.db.execute(sql`
      delete from ${authEvents}
       where id in (
         select id from ${authEvents}
          where at < ${cutoff}
          order by id
          limit ${limit}
       )
      returning id
    `)

    return resultRows(result).length
  }
}
