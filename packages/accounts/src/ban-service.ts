/**
 * Ban lifecycle (F23).
 *
 * The rule that shapes this whole file is F23's acceptance criterion: **an
 * expired ban restores the prior group, not the default.** A moderator who is
 * banned for a week must come back a moderator. Restoring "registered" instead
 * is a silent demotion that nobody notices until that person tries to do their
 * job — so the group they held is captured at ban time and is the only thing
 * ever restored.
 */
import { ForbiddenError, ValidationError } from '@forum/core'

import type { BanRecord, BanRepository, Clock } from './ports'

export interface BanServiceDeps {
  readonly bans: BanRepository
  readonly clock?: Clock
  /** The group a banned user is moved into. */
  readonly bannedGroupId: number
}

export interface BanInput {
  readonly userId: number
  readonly bannedByUserId?: number | undefined
  readonly reason?: string | undefined
  readonly publicReason?: string | undefined
  /** Omit for a permanent ban. */
  readonly expiresAt?: Date | undefined
}

export class BanService {
  private readonly now: () => Date

  constructor(private readonly deps: BanServiceDeps) {
    this.now = deps.clock ?? (() => new Date())
  }

  /**
   * Ban a user, remembering the group they were in.
   *
   * Capturing `previousPrimaryGroupId` is the entire mechanism behind the
   * restore-on-expiry guarantee, so it is read *before* the move and written in
   * the same transaction — a crash between the two would strand the user in the
   * banned group with nothing recording where they came from.
   */
  async ban(input: BanInput): Promise<BanRecord> {
    const now = this.now()

    if (input.expiresAt !== undefined && input.expiresAt <= now) {
      throw new ValidationError('A ban cannot expire in the past.')
    }

    const existing = await this.deps.bans.findActive(input.userId)
    if (existing) {
      throw new ValidationError('That user is already banned. Lift the existing ban first.')
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

  /** Lift early. Same restore path as expiry, so there is one code path to trust. */
  async lift(userId: number): Promise<void> {
    const active = await this.deps.bans.findActive(userId)
    if (!active) throw new ValidationError('That user is not banned.')

    await this.deps.bans.lift(active.id, this.now())
  }

  /**
   * The `expire-bans` task (R9).
   *
   * Idempotent and catch-up capable, as every scheduled task must be: it acts on
   * *outstanding state* — bans whose expiry has passed and which have not been
   * lifted — rather than on "what expired since I last ran". Missing three days
   * of ticks therefore costs nothing but a delay, and running twice in a row
   * does nothing the second time.
   */
  async expireDue(limit = 200): Promise<number> {
    return this.deps.bans.expireDue(this.now(), limit)
  }

  /**
   * Throw if this user is currently banned.
   *
   * Called on login. A banned user whose session is still alive is handled
   * separately — banning revokes sessions — but the credential path has to
   * refuse too, or a ban is merely a logout.
   */
  async assertNotBanned(userId: number): Promise<void> {
    const active = await this.deps.bans.findActive(userId)
    if (!active) return

    /*
     * The *public* reason, never the internal one: `reason` is staff-facing and
     * routinely contains notes ("linked to the account we banned last week")
     * that must not be handed to the person it is about.
     */
    throw new ForbiddenError(
      active.publicReason
        ? `This account is banned: ${active.publicReason}`
        : 'This account is banned.',
    )
  }
}
