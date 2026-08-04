/**
 * F62 — the reputation service.
 *
 * Everything below is a guard on one act — "member A says something about
 * member B" — and each guard exists because of a specific way that act gets
 * abused.
 *
 * ## The total is derived, never incremented
 *
 * `users.reputation` is recomputed from the live rows inside the same
 * transaction as anything that changes them (the repository does it). An
 * incremented total cannot survive a rating being revised or withdrawn, and
 * when it drifts nobody notices until somebody counts by hand. Same argument
 * F53 makes for `warning_points`, and there is a test that corrupts the column
 * and watches it repair.
 *
 * ## The two limits are different mechanisms
 *
 * "One rating per pair, one per post" is uniqueness and lives in a partial
 * unique index — two clicks arriving together both pass a prior read. "At most
 * N a day" is a window, which no index expresses, so it is a count inside the
 * writing transaction; its residual race is one extra rating and is stated in
 * the migration rather than hidden.
 */
import { ForbiddenError, ValidationError } from '@meith/core'

import {
  COMMENT_MAX,
  type RaterLimits,
  type ReputationRepository,
  type ReputationRow,
  type ReputationSettings,
  type ReputationSummary,
} from './types'

export const REPUTATION_PAGE_SIZE = 25

export interface GiveInput {
  /** Who it is about. */
  readonly userId: number
  readonly givenByUserId: number
  /** The post it is about, or null for a rating on the profile. */
  readonly postId?: number | null
  readonly points: number
  readonly comment: string
  readonly settings: ReputationSettings
  readonly limits: RaterLimits
}

export class ReputationService {
  private readonly repository: ReputationRepository
  private readonly now: () => Date

  constructor(deps: { reputation: ReputationRepository; now?: () => Date }) {
    this.repository = deps.reputation
    this.now = deps.now ?? (() => new Date())
  }

  async give(input: GiveInput): Promise<void> {
    if (!input.settings.enabled) {
      throw new ForbiddenError('Reputation is switched off on this board.')
    }

    /*
     * Rating yourself is refused rather than merely pointless. Left open it is
     * the first thing anybody tries, and a profile showing self-awarded points
     * makes the whole number meaningless.
     */
    if (input.userId === input.givenByUserId) {
      throw new ValidationError('You cannot rate yourself.')
    }

    if (!input.limits.canGive) {
      throw new ForbiddenError('You cannot rate other members.')
    }

    /*
     * The post-count floor is what stops a fresh account from being useful for
     * this. A spammer can register in seconds; posting five times on a board
     * with moderation is a different proposition.
     */
    if (input.limits.postCount < input.settings.minPostsToGive) {
      throw new ForbiddenError(
        `You need at least ${input.settings.minPostsToGive} posts before you can rate anybody.`,
      )
    }

    const points = normalisePoints(input.points, input.settings)
    const comment = input.comment.trim()

    if (input.settings.commentRequired && comment === '') {
      throw new ValidationError('Say why. A rating with no reason is the part people argue about.')
    }
    if (comment.length > COMMENT_MAX) {
      throw new ValidationError(`A comment may be at most ${COMMENT_MAX} characters.`)
    }

    const wrote = await this.repository.give({
      userId: input.userId,
      givenByUserId: input.givenByUserId,
      postId: input.postId ?? null,
      points,
      comment,
      maxPerDay: input.limits.maxPerDay,
      at: this.now(),
    })

    if (!wrote) {
      /*
       * The cap, reported by the write rather than checked before it — a prior
       * read is a different transaction and would let two submits both pass.
       */
      throw new ForbiddenError(
        `You have given as many ratings as you can today (${input.limits.maxPerDay}). ` +
          'Try again tomorrow.',
      )
    }
  }

  /** Take a rating back. Only the member who gave it may. */
  async withdraw(ratingId: number, givenByUserId: number): Promise<boolean> {
    return this.repository.withdraw({ ratingId, givenByUserId })
  }

  async history(input: {
    readonly userId: number
    readonly before?: number | undefined
  }): Promise<{ rows: readonly ReputationRow[]; nextBefore: number | null }> {
    /* One extra row rather than a count, like every other pager here (F40). */
    const rows = await this.repository.list({
      userId: input.userId,
      limit: REPUTATION_PAGE_SIZE + 1,
      before: input.before,
    })

    const page = rows.slice(0, REPUTATION_PAGE_SIZE)
    const last = page[page.length - 1]
    return {
      rows: page,
      nextBefore: rows.length > REPUTATION_PAGE_SIZE && last !== undefined ? last.id : null,
    }
  }

  summary(userId: number): Promise<ReputationSummary> {
    return this.repository.summary(userId)
  }

  existing(input: {
    readonly givenByUserId: number
    readonly userId: number
    readonly postId?: number | null
  }): Promise<ReputationRow | null> {
    return this.repository.existing({
      givenByUserId: input.givenByUserId,
      userId: input.userId,
      postId: input.postId ?? null,
    })
  }

  /** How many this member has given today, for showing what is left. */
  givenToday(givenByUserId: number): Promise<number> {
    return this.repository.givenSince(givenByUserId, startOfDay(this.now()))
  }

  recount(userId: number): Promise<number> {
    return this.repository.recount(userId)
  }
}

/**
 * Clamp a submitted rating to what the board allows.
 *
 * A submitted `-1` on a board with negatives off becomes a **refusal**, not a
 * silent `+1`: quietly turning a criticism into praise is the worst possible
 * reading of somebody's intent. Anything outside the three values is refused
 * too — the form offers three buttons, so a fourth value is somebody posting
 * by hand.
 */
function normalisePoints(points: number, settings: ReputationSettings): number {
  if (!Number.isInteger(points) || points > 1 || points < -1) {
    throw new ValidationError('That is not a rating.')
  }
  if (points < 0 && !settings.allowNegative) {
    throw new ValidationError('This board does not allow negative ratings.')
  }
  return points
}

/**
 * Midnight UTC.
 *
 * The board's day, not the member's: F57 gives every member a timezone, and a
 * daily cap that reset at each member's local midnight would let somebody in
 * the right zone get two allowances out of one calendar day by waiting an hour.
 */
function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
