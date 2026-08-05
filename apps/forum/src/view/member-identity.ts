/**
 * What a page knows about a member's standing, as the view layer sees it.
 *
 * A pure type, in `view/` rather than beside the query that fills it, because
 * `server/group-identity.ts` is `server-only` and a view builder importing it
 * would drag the database and `next/headers` into modules whose whole point is
 * that they are plain functions over plain data.
 *
 * So the server module produces this shape and the builders consume it, and
 * neither has to know about the other.
 */
export interface MemberIdentity {
  readonly groupId: number
  /** The display group's title — what a postbit shows under a name. */
  readonly title: string
  /** A CSS class carrying the group's colour, or `null` for most groups. */
  readonly nameClass: string | null
  /** Already resolved for this reader's colour scheme; see `resolveBadge`. */
  readonly badge: {
    readonly src: string
    readonly darkSrc: string | null
    readonly alt: string
  } | null
  readonly reputation: number
}

/**
 * What every listing needs and nothing more.
 *
 * A forum row, a thread row, "who is online" and the board's stats each render
 * a name and want it in the member's group colour. None of them wants the
 * title, the badge or the reputation — those belong to the postbit, which has
 * the room for them.
 *
 * So the map is passed whole and each builder takes the one field it uses,
 * through this, rather than six builders each writing the same two null checks
 * slightly differently. The `undefined` case is the honest common one: a board
 * on sample data has no groups repository, and a page that has not asked for
 * identities passes nothing.
 */
export function nameClassOf(
  identities: ReadonlyMap<number, MemberIdentity> | undefined,
  userId: number | null,
): string | null {
  if (identities === undefined || userId === null) return null
  return identities.get(userId)?.nameClass ?? null
}

/** Every distinct, non-null id in a list, ready for one `identitiesFor` call. */
export function distinctUserIds(ids: readonly (number | null)[]): readonly number[] {
  return [...new Set(ids.filter((id): id is number => id !== null))]
}
