/**
 * F75's pure view models: who is online, and the board's totals.
 *
 * The interesting function is `locationOf`, and it is interesting for a reason
 * that is easy to miss: **it never decides anything.** The repository has
 * already replaced every community and thread the reader may not be told about with
 * null, so this turns a resolved row into a label and a link and nothing more.
 *
 * That split is the design. If this function chose what to hide, every theme
 * that rendered the panel itself — and F76's feeds, and any future API — would
 * have to make the same choice again, and one of them would get it wrong.
 */
import type {
  BoardStatsModel,
  OnlineMemberModel,
  WhoIsOnlineModel,
} from '@meith/theme-kit'

import { nameClassOf, type MemberIdentity } from './member-identity'
import { memberHref } from './member-profile'
import { formatTime } from './time'

/** What the repository returns, restated so this module needs no `@meith/db`. */
export interface OnlineRow {
  readonly userId: number
  readonly username: string
  readonly invisible: boolean
  readonly lastSeenAt: Date
  readonly communityId: number | null
  readonly communityTitle: string | null
  readonly threadId: number | null
  readonly threadTitle: string | null
  readonly threadSlug: string | null
}

export interface OnlineInput {
  readonly members: readonly OnlineRow[]
  readonly guestCount: number
  readonly recordCount: number
  readonly recordAt: Date | null
  readonly now: Date
  readonly timeZone?: string | undefined
  /** Group colours for the members listed, or absent on a board with none. */
  readonly identities?: ReadonlyMap<number, MemberIdentity>
}

/**
 * Where somebody is, in words.
 *
 * The three cases are three different amounts of knowledge, and the fallback is
 * the honest one: a null community id does not mean "nowhere", it means the reader
 * may not be told. "Viewing a community" is true of somebody in the staff room and
 * true of somebody in a community this build has no route for, and it gives away
 * neither.
 */
export function locationOf(row: OnlineRow): { label: string; href: string | null } {
  if (row.threadId !== null && row.threadTitle !== null) {
    return {
      label: `Reading ${row.threadTitle}`,
      href: `/thread/${row.threadId}-${row.threadSlug ?? ''}`,
    }
  }

  /*
   * The repository gates the id and the title on the same predicate, so the
   * two are never different — but the href genuinely consumes the id, so each
   * half of the check carries its own weight. The session row holds no slug,
   * and it does not need one: the community route accepts a bare `/<id>`.
   */
  if (row.communityId !== null && row.communityTitle !== null) {
    return { label: `Viewing ${row.communityTitle}`, href: `/${row.communityId}` }
  }

  return { label: 'Somewhere on the board', href: null }
}

export function buildWhoIsOnlineModel(input: OnlineInput): WhoIsOnlineModel {
  const members: OnlineMemberModel[] = input.members.map((row) => ({
    userId: row.userId,
    username: row.username,
    profileHref: memberHref(row.userId),
    nameClass: nameClassOf(input.identities, row.userId),
    location: locationOf(row),
    isInvisible: row.invisible,
    lastSeen: formatTime(row.lastSeenAt, input.now, input.timeZone),
  }))

  return {
    guestCount: input.guestCount,
    members,
    /*
     * Derived here rather than carried from the repository. Its `total` is
     * exactly this sum — the rows it excludes are excluded before it counts
     * them, which is what makes an invisible member hidden rather than
     * subtractable — so passing it in would be a second copy of one number
     * that no test could tell apart from this one.
     */
    total: members.length + input.guestCount,
    recordCount: input.recordCount,
    recordAt:
      input.recordAt === null ? null : formatTime(input.recordAt, input.now, input.timeZone),
    fullListHref: '/online',
  }
}

export interface StatsInput {
  readonly threadCount: number
  readonly postCount: number
  readonly memberCount: number
  readonly newestUserId: number | null
  readonly newestUsername: string | null
  readonly computedAt: Date | null
  readonly now: Date
  readonly timeZone?: string | undefined
  /** Group colours, for the one name this model carries. */
  readonly identities?: ReadonlyMap<number, MemberIdentity>
}

export function buildBoardStatsModel(input: StatsInput): BoardStatsModel {
  return {
    threadCount: input.threadCount,
    postCount: input.postCount,
    memberCount: input.memberCount,
    /*
     * A name with no id is still a name worth showing — the account may have
     * been deleted between the rollup and the render, and `UserRefModel` has
     * carried a null `userId` for exactly that since F29.
     */
    newestMember:
      input.newestUsername === null
        ? null
        : {
            userId: input.newestUserId,
            username: input.newestUsername,
            profileHref: input.newestUserId === null ? null : memberHref(input.newestUserId),
            nameClass: nameClassOf(input.identities, input.newestUserId),
          },
    computedAt:
      input.computedAt === null ? null : formatTime(input.computedAt, input.now, input.timeZone),
  }
}
