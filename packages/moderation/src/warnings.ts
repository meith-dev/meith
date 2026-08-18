import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

export type WarningAction = 'suspend_posting' | 'moderate_posting' | 'ban'

export const WARNING_ACTIONS: readonly WarningAction[] = [
  'suspend_posting',
  'moderate_posting',
  'ban',
]

export const REASON_MAX = 2000
export const TITLE_MAX = 150
export const POINTS_MAX = 100
export const WARNINGS_PAGE_SIZE = 25

export interface WarningType {
  readonly id: number
  readonly title: string
  readonly points: number
  readonly expiryDays: number | null
}

export interface WarningLevel {
  readonly points: number
  readonly action: WarningAction
  readonly durationDays: number | null
}

export interface WarningRow {
  readonly id: number
  readonly userId: number
  readonly title: string
  readonly points: number
  readonly reason: string
  readonly issuedByUserId: number | null
  readonly issuedByUsername: string | null
  readonly postId: number | null
  readonly createdAt: Date
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly revokedByUsername: string | null
  readonly revokeReason: string | null
}

export interface WarningPage {
  readonly rows: readonly WarningRow[]
  readonly nextCursor?: string
}

export interface WarningStanding {
  readonly userId: number
  readonly points: number
  readonly level: WarningLevel | null
}

export interface PostingRestriction {
  readonly suspendedUntil: Date | null
  readonly moderatedUntil: Date | null
}

export const NO_RESTRICTION: PostingRestriction = {
  suspendedUntil: null,
  moderatedUntil: null,
}

export interface IssuedWarning {
  readonly warningId: number
  readonly points: number
  readonly standing: WarningStanding
  readonly triggered: WarningLevel | null
}

export interface WarningRepository {
  listTypes(): Promise<readonly WarningType[]>
  listLevels(): Promise<readonly WarningLevel[]>

  findType(typeId: number): Promise<WarningType | null>

  findWarnable(userId: number): Promise<{ id: number; username: string } | null>

  findPostAuthor(postId: number): Promise<number | null>

  issue(input: {
    readonly userId: number
    readonly issuedByUserId: number
    readonly typeId: number | null
    readonly title: string
    readonly points: number
    readonly reason: string
    readonly postId: number | null
    readonly expiresAt: Date | null
    readonly at: Date
  }): Promise<{ warningId: number; points: number }>

  revoke(input: {
    readonly warningId: number
    readonly actorUserId: number
    readonly reason: string
    readonly at: Date
  }): Promise<{ userId: number; points: number } | null>

  pointsFor(userId: number): Promise<number>

  readRestriction(userId: number): Promise<PostingRestriction>

  applyRestriction(input: {
    readonly userId: number
    readonly restriction: PostingRestriction
    readonly at: Date
  }): Promise<void>

  history(
    userId: number,
    options: { readonly limit: number; readonly after?: string },
  ): Promise<WarningPage>

  expireDue(now: Date, limit: number): Promise<{ expired: number; userIds: readonly number[] }>
}

export interface WarningBanPort {
  ban(input: {
    readonly userId: number
    readonly bannedByUserId: number
    readonly reason: string
    readonly publicReason: string
    readonly expiresAt?: Date | undefined
  }): Promise<void>
}

export interface WarningNotifierPort {
  warned(input: {
    readonly userId: number
    readonly title: string
    readonly points: number
    readonly totalPoints: number
    readonly reason: string
    readonly restriction: WarningAction | null
  }): Promise<void>
}

export class WarningService {
  private readonly warnings: WarningRepository
  private readonly bans: WarningBanPort | null
  private readonly notifier: WarningNotifierPort | null
  private readonly now: () => Date

  constructor(deps: {
    warnings: WarningRepository
    bans?: WarningBanPort | null
    notifier?: WarningNotifierPort | null
    now?: () => Date
  }) {
    this.warnings = deps.warnings
    this.bans = deps.bans ?? null
    this.notifier = deps.notifier ?? null
    this.now = deps.now ?? (() => new Date())
  }

  async listTypes(): Promise<readonly WarningType[]> {
    return this.warnings.listTypes()
  }

  async history(userId: number, options: { readonly after?: string } = {}): Promise<WarningPage> {
    return this.warnings.history(userId, {
      limit: WARNINGS_PAGE_SIZE,
      ...(options.after === undefined ? {} : { after: options.after }),
    })
  }

  async issue(input: {
    readonly userId: number
    readonly actorUserId: number
    readonly typeId: number | null
    readonly title?: string | undefined
    readonly points?: number | undefined
    readonly reason: string
    readonly postId?: number | null
    readonly mayWarn: boolean
  }): Promise<IssuedWarning> {
    if (!input.mayWarn) throw new ValidationError(msg('error.moderation.warn-members'))

    if (input.userId === input.actorUserId) {
      throw new ValidationError(msg('error.moderation.warn-yourself'))
    }

    const target = await this.warnings.findWarnable(input.userId)
    if (target === null) throw new ValidationError(msg('error.moderation.member-exist'))

    const reason = input.reason.trim()
    if (reason.length === 0) throw new ValidationError(msg('error.moderation.say-what-warning-for'))
    if (reason.length > REASON_MAX) {
      throw new ValidationError(msg('error.moderation.reason-length', { max: REASON_MAX }))
    }

    const { title, points, expiryDays } = await this.resolveSubject(input)

    const at = this.now()
    const before = await this.standingFor(input.userId)

    const written = await this.warnings.issue({
      userId: input.userId,
      issuedByUserId: input.actorUserId,
      typeId: input.typeId,
      title,
      points,
      reason,
      postId: input.postId ?? null,
      expiresAt: expiryDays === null ? null : addDays(at, expiryDays),
      at,
    })

    const after = await this.standingFrom(written.points)
    const triggered = newlyReached(before.level, after.level)
    await this.enforce(input.userId, after, at, input.actorUserId, triggered)

    if (this.notifier !== null) {
      await this.notifier
        .warned({
          userId: input.userId,
          title,
          points,
          totalPoints: written.points,
          reason,
          restriction: triggered?.action ?? null,
        })
        .catch(() => undefined)
    }

    return {
      warningId: written.warningId,
      points: written.points,
      standing: { userId: input.userId, points: written.points, level: after.level },
      triggered,
    }
  }

  async revoke(input: {
    readonly warningId: number
    readonly actorUserId: number
    readonly reason: string
    readonly mayWarn: boolean
  }): Promise<WarningStanding | null> {
    if (!input.mayWarn) throw new ValidationError(msg('error.moderation.revoke-warnings'))

    const reason = input.reason.trim()
    if (reason.length > REASON_MAX) {
      throw new ValidationError(msg('error.moderation.reason-length', { max: REASON_MAX }))
    }

    const at = this.now()
    const revoked = await this.warnings.revoke({
      warningId: input.warningId,
      actorUserId: input.actorUserId,
      reason,
      at,
    })
    if (revoked === null) return null

    const standing = await this.standingFrom(revoked.points)
    await this.enforce(revoked.userId, standing, at, input.actorUserId, null)

    return { userId: revoked.userId, points: revoked.points, level: standing.level }
  }

  async expireDue(limit = 200): Promise<number> {
    const at = this.now()
    const { expired, userIds } = await this.warnings.expireDue(at, limit)

    for (const userId of userIds) {
      const points = await this.warnings.pointsFor(userId)
      const standing = await this.standingFrom(points)
      await this.enforce(userId, standing, at, null, null)
    }
    return expired
  }

  async standingFor(userId: number): Promise<WarningStanding> {
    const points = await this.warnings.pointsFor(userId)
    const standing = await this.standingFrom(points)
    return { userId, points, level: standing.level }
  }

  private async resolveSubject(input: {
    readonly typeId: number | null
    readonly title?: string | undefined
    readonly points?: number | undefined
  }): Promise<{ title: string; points: number; expiryDays: number | null }> {
    if (input.typeId !== null) {
      const type = await this.warnings.findType(input.typeId)
      if (type === null) throw new ValidationError(msg('error.moderation.warning-type-exist'))
      return { title: type.title, points: type.points, expiryDays: type.expiryDays }
    }

    const title = (input.title ?? '').trim()
    if (title.length === 0) throw new ValidationError(msg('error.moderation.warning-needs-title'))
    if (title.length > TITLE_MAX) {
      throw new ValidationError(msg('error.moderation.warning-title-length', { max: TITLE_MAX }))
    }

    const points = input.points ?? 0
    if (!Number.isSafeInteger(points) || points < 1 || points > POINTS_MAX) {
      throw new ValidationError(msg('error.moderation.points-range', { max: POINTS_MAX }))
    }
    return { title, points, expiryDays: null }
  }

  private async standingFrom(points: number): Promise<{ level: WarningLevel | null }> {
    const levels = await this.warnings.listLevels()
    let reached: WarningLevel | null = null
    for (const level of levels) {
      if (points >= level.points && (reached === null || level.points > reached.points)) {
        reached = level
      }
    }
    return { level: reached }
  }

  private async enforce(
    userId: number,
    standing: { level: WarningLevel | null },
    at: Date,
    actorUserId: number | null,
    triggered: WarningLevel | null,
  ): Promise<void> {
    const level = standing.level
    const restriction: PostingRestriction =
      level === null || level.action === 'ban'
        ? NO_RESTRICTION
        : {
            suspendedUntil:
              level.action === 'suspend_posting' ? until(at, level.durationDays) : null,
            moderatedUntil:
              level.action === 'moderate_posting' ? until(at, level.durationDays) : null,
          }

    await this.warnings.applyRestriction({ userId, restriction, at })

    if (triggered?.action === 'ban' && this.bans !== null && actorUserId !== null) {
      await this.bans
        .ban({
          userId,
          bannedByUserId: actorUserId,
          reason: `Reached ${triggered.points} warning points.`,
          publicReason: 'Repeated breaches of the board rules.',
          ...(triggered.durationDays === null
            ? {}
            : { expiresAt: addDays(at, triggered.durationDays) }),
        })
        .catch(() => undefined)
    }
  }
}

function newlyReached(
  before: WarningLevel | null,
  after: WarningLevel | null,
): WarningLevel | null {
  if (after === null) return null
  if (before !== null && before.points >= after.points) return null
  return after
}

function until(at: Date, days: number | null): Date | null {
  return days === null ? FOREVER : addDays(at, days)
}

const FOREVER = new Date('9999-12-31T00:00:00Z')

function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * 86_400_000)
}

export function restrictsPosting(
  restriction: PostingRestriction,
  now: Date,
): { suspended: boolean; moderated: boolean } {
  return {
    suspended: restriction.suspendedUntil !== null && restriction.suspendedUntil > now,
    moderated: restriction.moderatedUntil !== null && restriction.moderatedUntil > now,
  }
}

export function parseWarningAction(value: string): WarningAction | null {
  return WARNING_ACTIONS.includes(value as WarningAction) ? (value as WarningAction) : null
}
