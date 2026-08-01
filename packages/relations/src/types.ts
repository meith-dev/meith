/**
 * F61 — what one member thinks of another.
 *
 * Two lists that look like opposites and behave like them: a buddy is somebody
 * you want to notice, an ignored member is somebody you would rather not read.
 * They share a table and a primary key because they are **mutually exclusive** —
 * you cannot both follow somebody and refuse to read them — and one row per
 * ordered pair is what makes that a constraint rather than a convention.
 *
 * The pair is **ordered and asymmetric**. `(me, them)` is my opinion of them
 * and says nothing about theirs of me. That is the point of ignoring: a board
 * where it were mutual would let anybody silence themselves in somebody else's
 * eyes by ignoring them first.
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next. It knows
 * nothing about groups or permissions — whether staff may be ignored is a
 * question the app asks the Authorizer and hands here as a boolean.
 */

export const RELATION_KINDS = ['buddy', 'ignore'] as const
export type RelationKind = (typeof RELATION_KINDS)[number]

export function parseRelationKind(value: string): RelationKind | null {
  return RELATION_KINDS.includes(value as RelationKind) ? (value as RelationKind) : null
}

/**
 * How many people may be on one member's two lists together.
 *
 * A ceiling rather than a setting, because the number only matters as a bound
 * on the ignore set that every thread render loads. A member who genuinely
 * wants to ignore two hundred people is describing a board they should leave
 * rather than a list they need.
 */
export const MAX_RELATIONS = 200

/**
 * How long after their last activity somebody still counts as online.
 *
 * Fifteen minutes, matching the interval most boards use. It lives here rather
 * than in a setting because F75 owns the board-wide online list and will want
 * one answer; until then this is the only consumer, and two constants that must
 * agree are how they stop agreeing.
 */
export const ONLINE_WINDOW_MINUTES = 15

export function isOnline(lastActiveAt: Date | null, now: Date): boolean {
  if (lastActiveAt === null) return false
  return now.getTime() - lastActiveAt.getTime() <= ONLINE_WINDOW_MINUTES * 60_000
}

/** One row of somebody's list, with what it takes to render a line. */
export interface RelationRow {
  readonly userId: number
  readonly username: string
  readonly kind: RelationKind
  readonly lastActiveAt: Date | null
  readonly createdAt: Date
}

export interface RelationRepository {
  /** One member's list of one kind, by username. */
  list(input: {
    readonly userId: number
    readonly kind: RelationKind
  }): Promise<readonly RelationRow[]>

  /** How many rows this member has, across both kinds. */
  count(userId: number): Promise<number>

  /**
   * The ids this member ignores.
   *
   * Ids rather than rows, and the one read that happens on a *page* rather than
   * on a screen somebody opened deliberately: every thread render needs it. It
   * is bounded by `MAX_RELATIONS` and cached per request by the caller.
   */
  ignoredIds(userId: number): Promise<readonly number[]>

  /** Set or replace this member's opinion of somebody. Idempotent. */
  set(input: {
    readonly userId: number
    readonly otherUserId: number
    readonly kind: RelationKind
    readonly at: Date
  }): Promise<void>

  /** Remove it. Returns false when there was nothing there. */
  remove(input: { readonly userId: number; readonly otherUserId: number }): Promise<boolean>

  /**
   * Does `ownerUserId` ignore `otherUserId`?
   *
   * The reverse-direction question, asked *about* somebody rather than by them:
   * F60's send path needs it per recipient, which is what the reverse index
   * exists for.
   */
  ignores(ownerUserId: number, otherUserId: number): Promise<boolean>
}
