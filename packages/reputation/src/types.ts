/**
 * F62 — what a reputation rating is.
 *
 * A rating is one member's opinion of another, worth a small number of points,
 * with a reason attached. It has two shapes that share a table: a rating on
 * somebody's **profile**, of which there is one per pair ever, and a rating on
 * one of their **posts**, of which there is one per post. Both are enforced by
 * partial unique indexes rather than by a prior read (see the migration).
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next. It has no
 * idea what a group is — "may this member rate at all" and "how many a day"
 * arrive as a boolean and a number, resolved by `@forum/authorization` (F20).
 */

export const COMMENT_MAX = 500

/**
 * The values a rating may take.
 *
 * Three, not a range. Reputation is a signal rather than a score, and a board
 * where one member can hand out five points at a time is one where a handful of
 * people decide everybody's number. `0` is a *neutral* comment — MyBB has it,
 * and it turns out to be what most ratings actually are.
 */
export const RATING_VALUES = [1, 0, -1] as const
export type RatingValue = (typeof RATING_VALUES)[number]

export function parseRating(value: string): RatingValue | null {
  /*
   * The trim-and-empty guard is not decoration: `Number('')` is 0, which is a
   * *valid* rating — so without it a form posted with no value at all would
   * record a neutral rating rather than being refused. Found by the test below.
   */
  const trimmed = value.trim()
  if (trimmed === '') return null

  const parsed = Number(trimmed)
  return (RATING_VALUES as readonly number[]).includes(parsed)
    ? (parsed as RatingValue)
    : null
}

/** What the board has decided about reputation, resolved from settings. */
export interface ReputationSettings {
  readonly enabled: boolean
  readonly allowNegative: boolean
  readonly commentRequired: boolean
  /** 0 disables the requirement. */
  readonly minPostsToGive: number
}

/** What the *rater* may do, resolved from their groups by the caller. */
export interface RaterLimits {
  readonly canGive: boolean
  /** 0 = unlimited, matching every numeric permission (R4.2). */
  readonly maxPerDay: number
  /** Their post count, for `minPostsToGive`. */
  readonly postCount: number
}

/** One rating, as the history screen shows it. */
export interface ReputationRow {
  readonly id: number
  readonly userId: number
  readonly givenByUserId: number | null
  readonly givenByUsername: string | null
  readonly postId: number | null
  /**
   * The thread the rated post is in, so the history can link to it.
   *
   * The thread *id* and nothing else — no title and no slug. A profile is
   * visible to more people than every forum on the board is, and the thread
   * page enforces its own visibility, so a bare id leaks nothing a 404 would
   * not already say.
   */
  readonly threadId: number | null
  readonly points: number
  readonly comment: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** Somebody's standing, as a profile shows it. */
export interface ReputationSummary {
  readonly total: number
  readonly positive: number
  readonly neutral: number
  readonly negative: number
}

export interface ReputationRepository {
  /**
   * Write a rating and recompute the target's total, in one transaction.
   *
   * Returns false when the daily cap was already reached — checked inside the
   * same transaction, so the count and the insert see one state.
   */
  give(input: {
    readonly userId: number
    readonly givenByUserId: number
    readonly postId: number | null
    readonly points: number
    readonly comment: string
    readonly maxPerDay: number
    readonly at: Date
  }): Promise<boolean>

  /** Withdraw one rating, if it is the caller's, and recompute. */
  withdraw(input: {
    readonly ratingId: number
    readonly givenByUserId: number
  }): Promise<boolean>

  /** One member's ratings, newest first. */
  list(input: {
    readonly userId: number
    readonly limit: number
    readonly before?: number | undefined
  }): Promise<readonly ReputationRow[]>

  summary(userId: number): Promise<ReputationSummary>

  /** What this rater has already said about this member, or about this post. */
  existing(input: {
    readonly givenByUserId: number
    readonly userId: number
    readonly postId: number | null
  }): Promise<ReputationRow | null>

  /** How many ratings this member has given since `since`. */
  givenSince(givenByUserId: number, since: Date): Promise<number>

  /**
   * Recompute one member's cached total from the live rows.
   *
   * Exposed rather than internal because F70's Recount & Rebuild needs it, and
   * because a test that corrupts the column and watches it repair is the only
   * honest way to prove the total is derived rather than incremented.
   */
  recount(userId: number): Promise<number>
}
