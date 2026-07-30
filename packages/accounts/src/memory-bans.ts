/**
 * In-memory ban store, so `BanService` can be driven with a fixed clock and no
 * database. The Postgres implementation must behave identically — the same
 * expectations run against both.
 */
import type { BanFilter } from './ban-filter'
import type {
  AccountRepository,
  BanFilterRepository,
  BanRecord,
  BanRepository,
  CreateBanInput,
} from './ports'

/** Minimal surface the memory ban store needs from the account store. */
export interface MemoryBanDeps {
  readonly accounts: AccountRepository & {
    /** Test-visible primary-group access; the Postgres path uses SQL. */
    getPrimaryGroupId?(userId: number): Promise<number | null>
    setPrimaryGroupId?(userId: number, groupId: number | null): Promise<void>
    revokeAllSessions?(userId: number): Promise<void>
  }
}

export class MemoryBans implements BanRepository {
  private readonly rows: (BanRecord & { bannedByUserId: number | null })[] = []
  private nextId = 1

  /** Primary group per user, standing in for the `users` table. */
  private readonly primaryGroup = new Map<number, number | null>()
  /** Users whose sessions were revoked, so a test can assert it happened. */
  readonly revoked: number[] = []

  setPrimaryGroup(userId: number, groupId: number | null): void {
    this.primaryGroup.set(userId, groupId)
  }

  primaryGroupOf(userId: number): number | null {
    return this.primaryGroup.get(userId) ?? null
  }

  async findActive(userId: number): Promise<BanRecord | null> {
    return this.rows.find((r) => r.userId === userId && r.liftedAt === null) ?? null
  }

  async create(input: CreateBanInput): Promise<BanRecord> {
    // Captured *before* the move — this value is the whole restore mechanism.
    const previousPrimaryGroupId = this.primaryGroup.get(input.userId) ?? null

    const row = {
      id: this.nextId++,
      userId: input.userId,
      bannedByUserId: input.bannedByUserId,
      reason: input.reason,
      publicReason: input.publicReason,
      previousPrimaryGroupId,
      expiresAt: input.expiresAt,
      liftedAt: null,
    }
    this.rows.push(row)

    this.primaryGroup.set(input.userId, input.bannedGroupId)
    this.revoked.push(input.userId)
    return row
  }

  async lift(banId: number, now: Date): Promise<void> {
    const row = this.rows.find((r) => r.id === banId && r.liftedAt === null)
    if (!row) return

    ;(row as { liftedAt: Date | null }).liftedAt = now
    this.primaryGroup.set(row.userId, row.previousPrimaryGroupId)
  }

  async expireDue(now: Date, limit: number): Promise<number> {
    const due = this.rows
      .filter((r) => r.liftedAt === null && r.expiresAt !== null && r.expiresAt <= now)
      .slice(0, limit)

    for (const row of due) await this.lift(row.id, now)
    return due.length
  }
}

export class MemoryBanFilters implements BanFilterRepository {
  private readonly rows: BanFilter[] = []
  private nextId = 1

  add(type: BanFilter['type'], pattern: string): BanFilter {
    const row = { id: this.nextId++, type, pattern }
    this.rows.push(row)
    return row
  }

  async listAll(): Promise<readonly BanFilter[]> {
    return [...this.rows]
  }
}
