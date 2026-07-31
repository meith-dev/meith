/**
 * F53 — warnings.
 *
 * A warning is the only moderator act on this board that is aimed at a *person*
 * rather than at content, and that difference produces every rule in this file.
 * Content has one current state; a person has a history that accumulates, ages
 * out, and can be corrected.
 *
 * One decision shapes the rest: **the points total is derived, never
 * incremented.**
 *
 * An incremented total cannot survive a revocation. Withdrawing a three-point
 * warning issued four months ago means subtracting three from a number that has
 * since been decremented by two expiries and incremented by a fourth warning —
 * and if any one of those steps was ever missed, the total is wrong with
 * nothing to compare it against. `warnings` is the record; `users.warning_points`
 * is a cache, recomputed from the live rows after anything touches them. It is
 * F38's recount argument applied to a counter small enough to recompute every
 * time.
 *
 * The consequence worth stating plainly: **every path that changes a warning
 * goes through the same recalculation, and the recalculation re-evaluates the
 * level.** That is what makes revocation actually lift a restriction, rather
 * than lowering a number while the suspension stays where it was.
 */
import { ValidationError } from '@forum/core'

/** What a level does when a member reaches it. */
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

/** A configured reason, as the warn form offers it. */
export interface WarningType {
  readonly id: number
  readonly title: string
  readonly points: number
  /** Null = never expires. */
  readonly expiryDays: number | null
}

/** A configured threshold. */
export interface WarningLevel {
  readonly points: number
  readonly action: WarningAction
  /** Null = for as long as the member is at this level. */
  readonly durationDays: number | null
}

/** One row of a member's history. */
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
  /** Opaque; `undefined` when this is the last page. */
  readonly nextCursor?: string
}

/** What a member's warnings currently amount to. */
export interface WarningStanding {
  readonly userId: number
  readonly points: number
  /** The highest threshold reached, or `null` when none is. */
  readonly level: WarningLevel | null
}

/** The restrictions the posting path enforces (F39/F40). */
export interface PostingRestriction {
  /** May not post at all until this moment. */
  readonly suspendedUntil: Date | null
  /** Posts are held for approval until this moment. */
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
  /**
   * The level this warning *newly* took the member to, or `null`.
   *
   * Newly, not currently: a second warning at the same level must not re-apply
   * its action, or a moderator issuing two in a minute silently doubles a
   * fourteen-day suspension into twenty-eight.
   */
  readonly triggered: WarningLevel | null
}

export interface WarningRepository {
  listTypes(): Promise<readonly WarningType[]>
  /** Ascending by points. The domain picks the highest one reached. */
  listLevels(): Promise<readonly WarningLevel[]>

  findType(typeId: number): Promise<WarningType | null>

  /** Whether this member exists and may be warned — a deleted account may not. */
  findWarnable(userId: number): Promise<{ id: number; username: string } | null>

  /**
   * Who wrote a post, for the evidence a warning cites.
   *
   * The post id arrives in a URL, so it is re-read: a warning that cites a post
   * by a *different* member is a record that says the wrong thing about what
   * happened, and it is the kind of wrong nobody notices until an appeal.
   */
  findPostAuthor(postId: number): Promise<number | null>

  /**
   * Write the warning, recompute the member's total from the live rows, and
   * return the new standing — **in one transaction**. A warning that exists
   * without the total that reflects it is a member the board treats as clean.
   */
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

  /**
   * Withdraw a warning and recompute. Returns the member and their new total,
   * or `null` when it was already revoked — the guard is on the update, so a
   * double submit reaches neither the recount nor the audit log.
   */
  revoke(input: {
    readonly warningId: number
    readonly actorUserId: number
    readonly reason: string
    readonly at: Date
  }): Promise<{ userId: number; points: number } | null>

  /** Current total, recomputed from live rows. Used after an expiry sweep. */
  pointsFor(userId: number): Promise<number>

  /**
   * The member's two restriction timestamps, for the posting path.
   *
   * On this port rather than a free function so the posting path depends on the
   * same interface everything else does — and so fixture mode's absence of a
   * warning store is one `null` check rather than two.
   */
  readRestriction(userId: number): Promise<PostingRestriction>

  /**
   * Apply a level's restriction, or clear both when `level` is null.
   *
   * One call for both directions on purpose: lifting is not a separate
   * operation, it is the same evaluation reaching a different answer.
   */
  applyRestriction(input: {
    readonly userId: number
    readonly restriction: PostingRestriction
    readonly at: Date
  }): Promise<void>

  history(
    userId: number,
    options: { readonly limit: number; readonly after?: string },
  ): Promise<WarningPage>

  /**
   * Expire warnings whose date has passed, and recompute every member they
   * belonged to. Returns how many warnings lapsed.
   */
  expireDue(now: Date, limit: number): Promise<{ expired: number; userIds: readonly number[] }>
}

/** How the service bans a member whose level says so. F23 owns the mechanism. */
export interface WarningBanPort {
  ban(input: {
    readonly userId: number
    readonly bannedByUserId: number
    readonly reason: string
    readonly publicReason: string
    readonly expiresAt?: Date | undefined
  }): Promise<void>
}

export class WarningService {
  private readonly warnings: WarningRepository
  private readonly bans: WarningBanPort | null
  private readonly now: () => Date

  constructor(deps: {
    warnings: WarningRepository
    /** Optional: a board with no ban path still warns, it just cannot ban. */
    bans?: WarningBanPort | null
    now?: () => Date
  }) {
    this.warnings = deps.warnings
    this.bans = deps.bans ?? null
    this.now = deps.now ?? (() => new Date())
  }

  async listTypes(): Promise<readonly WarningType[]> {
    return this.warnings.listTypes()
  }

  async history(
    userId: number,
    options: { readonly after?: string } = {},
  ): Promise<WarningPage> {
    return this.warnings.history(userId, {
      limit: WARNINGS_PAGE_SIZE,
      ...(options.after === undefined ? {} : { after: options.after }),
    })
  }

  /**
   * Issue a warning.
   *
   * `mayWarn` is the caller's already-resolved answer, for the reason every
   * command in this package takes booleans: group and matrix reasoning does not
   * leave `@forum/authorization` (R4).
   */
  async issue(input: {
    readonly userId: number
    readonly actorUserId: number
    /** A configured type, or `null` for a free-text warning. */
    readonly typeId: number | null
    /** Required when `typeId` is null; ignored otherwise. */
    readonly title?: string | undefined
    /** Required when `typeId` is null; ignored otherwise. */
    readonly points?: number | undefined
    readonly reason: string
    readonly postId?: number | null
    readonly mayWarn: boolean
  }): Promise<IssuedWarning> {
    if (!input.mayWarn) throw new ValidationError('You cannot warn members.')

    /*
     * Warning yourself is not a rule anybody needs and it is a way to trip your
     * own level actions — including the ban one, which would lock a moderator
     * out of the board with a restriction only another moderator can lift.
     */
    if (input.userId === input.actorUserId) {
      throw new ValidationError('You cannot warn yourself.')
    }

    const target = await this.warnings.findWarnable(input.userId)
    if (target === null) throw new ValidationError('That member does not exist.')

    const reason = input.reason.trim()
    if (reason.length === 0) throw new ValidationError('Say what the warning is for.')
    if (reason.length > REASON_MAX) {
      throw new ValidationError(`A reason may be at most ${REASON_MAX} characters.`)
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

    return {
      warningId: written.warningId,
      points: written.points,
      standing: { userId: input.userId, points: written.points, level: after.level },
      triggered,
    }
  }

  /**
   * Withdraw a warning.
   *
   * The restriction is re-evaluated from the recomputed total, which is the
   * whole point: a revocation that lowered a number and left a suspension in
   * place would be an apology the member cannot tell from a refusal.
   */
  async revoke(input: {
    readonly warningId: number
    readonly actorUserId: number
    readonly reason: string
    readonly mayWarn: boolean
  }): Promise<WarningStanding | null> {
    if (!input.mayWarn) throw new ValidationError('You cannot revoke warnings.')

    const reason = input.reason.trim()
    if (reason.length > REASON_MAX) {
      throw new ValidationError(`A reason may be at most ${REASON_MAX} characters.`)
    }

    const at = this.now()
    const revoked = await this.warnings.revoke({
      warningId: input.warningId,
      actorUserId: input.actorUserId,
      reason,
      at,
    })
    /* Already revoked, or never existed: the same answer, and neither is an error. */
    if (revoked === null) return null

    const standing = await this.standingFrom(revoked.points)
    /*
     * `null` for the fourth argument: nothing was newly reached by a revocation
     * — points only went down — so `enforce` may lift but never ban.
     */
    await this.enforce(revoked.userId, standing, at, input.actorUserId, null)

    return { userId: revoked.userId, points: revoked.points, level: standing.level }
  }

  /**
   * The `warnings.expire` task (R9).
   *
   * Acts on outstanding state — warnings whose expiry has passed and which have
   * not been revoked — rather than on "what expired since I last ran", so a
   * missed day costs a delay and a doubled tick expires nothing twice. Every
   * member touched is re-evaluated, which is how a suspension ends when the
   * warning that caused it ages out.
   */
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

  /** A member's current standing, for a profile or a moderator's screen. */
  async standingFor(userId: number): Promise<WarningStanding> {
    const points = await this.warnings.pointsFor(userId)
    const standing = await this.standingFrom(points)
    return { userId, points, level: standing.level }
  }

  /**
   * Which type, or which free-text values.
   *
   * The type's points and expiry are read from the *type row*, never from the
   * form: a submitted `points` on a typed warning would let a moderator with
   * one-point authority issue ten.
   */
  private async resolveSubject(input: {
    readonly typeId: number | null
    readonly title?: string | undefined
    readonly points?: number | undefined
  }): Promise<{ title: string; points: number; expiryDays: number | null }> {
    if (input.typeId !== null) {
      const type = await this.warnings.findType(input.typeId)
      if (type === null) throw new ValidationError('That warning type does not exist.')
      return { title: type.title, points: type.points, expiryDays: type.expiryDays }
    }

    const title = (input.title ?? '').trim()
    if (title.length === 0) throw new ValidationError('A warning needs a title.')
    if (title.length > TITLE_MAX) {
      throw new ValidationError(`A title may be at most ${TITLE_MAX} characters.`)
    }

    const points = input.points ?? 0
    if (!Number.isSafeInteger(points) || points < 1 || points > POINTS_MAX) {
      throw new ValidationError(`Points must be between 1 and ${POINTS_MAX}.`)
    }
    /* A free-text warning has no configured expiry, so it never expires. */
    return { title, points, expiryDays: null }
  }

  /** The highest threshold this total has reached. */
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

  /**
   * Make the member's restrictions match their level.
   *
   * Always both directions: a level of `null` clears them. That is what makes
   * expiry and revocation lift a restriction without either of them knowing
   * anything about restrictions.
   *
   * Banning is the exception, and deliberately one-way. It is applied only when
   * a level is *newly* reached, because F23 owns the ban lifecycle and the group
   * a ban captured — un-banning on a revocation would restore a group this
   * feature never saw, using a code path that already refuses to run twice.
   * A moderator lifts it, which is also the point at which somebody looks.
   */
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
        /*
         * A member already banned is not an error here. F23 refuses a second
         * ban, and the warning itself has been recorded — failing the whole act
         * because the punishment was already in force would leave a moderator
         * unable to warn somebody who is serving a ban.
         */
        .catch(() => undefined)
    }
  }
}

/**
 * Whether the level went *up*.
 *
 * A second warning at the same level must not re-apply its action, or a
 * moderator issuing two in a minute turns a fourteen-day suspension into
 * twenty-eight without meaning to.
 */
function newlyReached(
  before: WarningLevel | null,
  after: WarningLevel | null,
): WarningLevel | null {
  if (after === null) return null
  if (before !== null && before.points >= after.points) return null
  return after
}

/** `null` days means "while they are at this level", expressed as an open end. */
function until(at: Date, days: number | null): Date | null {
  return days === null ? FOREVER : addDays(at, days)
}

/**
 * The end of a restriction with no stated duration.
 *
 * A far-future timestamp rather than `null`, because `null` already means "no
 * restriction" on the column the posting path reads, and one column cannot mean
 * both. Such a restriction ends when the points do — the next expiry or
 * revocation re-evaluates and clears it.
 */
const FOREVER = new Date('9999-12-31T00:00:00Z')

function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * 86_400_000)
}

/** Is this restriction in force right now? The posting path's whole question. */
export function restrictsPosting(
  restriction: PostingRestriction,
  now: Date,
): { suspended: boolean; moderated: boolean } {
  return {
    suspended: restriction.suspendedUntil !== null && restriction.suspendedUntil > now,
    moderated: restriction.moderatedUntil !== null && restriction.moderatedUntil > now,
  }
}

/** Parse a warning action from configuration without trusting it. */
export function parseWarningAction(value: string): WarningAction | null {
  return WARNING_ACTIONS.includes(value as WarningAction) ? (value as WarningAction) : null
}
