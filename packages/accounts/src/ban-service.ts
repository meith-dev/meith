import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { BanRecord, BanRepository, Clock } from './ports'

export interface BanServiceDeps {
  readonly bans: BanRepository
  readonly clock?: Clock
  readonly bannedGroupId: number
}

export interface BanInput {
  readonly userId: number
  readonly bannedByUserId?: number | undefined
  readonly reason?: string | undefined
  readonly publicReason?: string | undefined
  readonly expiresAt?: Date | undefined
}

export class BanService {
  private readonly now: () => Date

  constructor(private readonly deps: BanServiceDeps) {
    this.now = deps.clock ?? (() => new Date())
  }

  async ban(input: BanInput): Promise<BanRecord> {
    const now = this.now()

    if (input.expiresAt !== undefined && input.expiresAt <= now) {
      throw new ValidationError(msg('error.accounts.ban-expire-past'))
    }

    const existing = await this.deps.bans.findActive(input.userId)
    if (existing) {
      throw new ValidationError(msg('error.accounts.user-already-banned-lift-existing'))
    }

    return this.deps.bans.create({
      userId: input.userId,
      bannedByUserId: input.bannedByUserId ?? null,
      reason: input.reason ?? null,
      publicReason: input.publicReason ?? null,
      expiresAt: input.expiresAt ?? null,
      bannedGroupId: this.deps.bannedGroupId,
      now,
    })
  }

  async lift(userId: number): Promise<void> {
    const active = await this.deps.bans.findActive(userId)
    if (!active) throw new ValidationError(msg('error.accounts.user-banned'))

    await this.deps.bans.lift(active.id, this.now())
  }

  async expireDue(limit = 200): Promise<number> {
    return this.deps.bans.expireDue(this.now(), limit)
  }

  async assertNotBanned(userId: number): Promise<void> {
    const active = await this.deps.bans.findActive(userId)
    if (!active) return

    throw new ForbiddenError(
      active.publicReason
        ? `This account is banned: ${active.publicReason}`
        : 'This account is banned.',
    )
  }
}
