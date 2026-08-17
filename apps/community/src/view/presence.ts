import type { Translator } from '@meith/i18n'
import type { BoardStatsModel, OnlineMemberModel, WhoIsOnlineModel } from '@meith/theme-kit'

import { type MemberIdentity, nameClassOf } from './member-identity'
import { memberHref } from './member-profile'
import { formatTime } from './time'

export interface OnlineRow {
  readonly userId: number
  readonly username: string
  readonly invisible: boolean
  readonly lastSeenAt: Date
  readonly forumId: number | null
  readonly forumTitle: string | null
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
  readonly t?: Translator | undefined
  readonly identities?: ReadonlyMap<number, MemberIdentity>
}

export function locationOf(row: OnlineRow): { label: string; href: string | null } {
  if (row.threadId !== null && row.threadTitle !== null) {
    return {
      label: `Reading ${row.threadTitle}`,
      href: `/thread/${row.threadId}-${row.threadSlug ?? ''}`,
    }
  }

  if (row.forumId !== null && row.forumTitle !== null) {
    return { label: `Viewing ${row.forumTitle}`, href: `/${row.forumId}` }
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
    lastSeen: formatTime(row.lastSeenAt, input.now, input.t),
  }))

  return {
    guestCount: input.guestCount,
    members,
    total: members.length + input.guestCount,
    recordCount: input.recordCount,
    recordAt: input.recordAt === null ? null : formatTime(input.recordAt, input.now, input.t),
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
  readonly t?: Translator | undefined
  readonly identities?: ReadonlyMap<number, MemberIdentity>
}

export function buildBoardStatsModel(input: StatsInput): BoardStatsModel {
  return {
    threadCount: input.threadCount,
    postCount: input.postCount,
    memberCount: input.memberCount,
    newestMember:
      input.newestUsername === null
        ? null
        : {
            userId: input.newestUserId,
            username: input.newestUsername,
            profileHref: input.newestUserId === null ? null : memberHref(input.newestUserId),
            nameClass: nameClassOf(input.identities, input.newestUserId),
          },
    computedAt: input.computedAt === null ? null : formatTime(input.computedAt, input.now, input.t),
  }
}
