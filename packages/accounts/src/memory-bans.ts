import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { assertUsableFilter, type BanFilter } from './ban-filter'
import type {
  AccountRepository,
  BanFilterAdminRepository,
  BanFilterRecord,
  BanRecord,
  BanRepository,
  CreateBanFilterInput,
  CreateBanInput,
} from './ports'

export interface MemoryBanDeps {
  readonly accounts: AccountRepository & {
    getPrimaryGroupId?(userId: number): Promise<number | null>
    setPrimaryGroupId?(userId: number, groupId: number | null): Promise<void>
    revokeAllSessions?(userId: number): Promise<void>
  }
}

export class MemoryBans implements BanRepository {
  private readonly rows: (BanRecord & { bannedByUserId: number | null })[] = []
  private nextId = 1

  private readonly primaryGroup = new Map<number, number | null>()
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

export class MemoryBanFilters implements BanFilterAdminRepository {
  private readonly rows: BanFilterRecord[] = []
  private nextId = 1

  add(type: BanFilter['type'], pattern: string, note: string | null = null): BanFilter {
    return this.insert({ type, pattern, note, createdByUserId: null })
  }

  async listAll(): Promise<readonly BanFilter[]> {
    return this.rows.map((row) => ({ id: row.id, type: row.type, pattern: row.pattern }))
  }

  async listForAdmin(): Promise<readonly BanFilterRecord[]> {
    return [...this.rows].sort((a, b) => b.id - a.id)
  }

  async create(input: CreateBanFilterInput): Promise<number> {
    assertUsableFilter(input.type, input.pattern)

    const pattern = input.pattern.trim()
    const note = input.note?.trim()

    if (this.rows.some((row) => row.type === input.type && row.pattern === pattern)) {
      throw new ValidationError(msg('error.accounts.ban-filter-already-held'))
    }

    return this.insert({
      type: input.type,
      pattern,
      note: note === undefined || note === '' ? null : note,
      createdByUserId: input.createdByUserId,
    }).id
  }

  async remove(id: number): Promise<void> {
    const at = this.rows.findIndex((row) => row.id === id)
    if (at !== -1) this.rows.splice(at, 1)
  }

  private insert(input: {
    type: BanFilter['type']
    pattern: string
    note: string | null
    createdByUserId: number | null
  }): BanFilterRecord {
    const row: BanFilterRecord = {
      id: this.nextId++,
      type: input.type,
      pattern: input.pattern,
      note: input.note,
      createdByUserId: input.createdByUserId,
      createdAt: new Date(),
    }
    this.rows.push(row)
    return row
  }
}
