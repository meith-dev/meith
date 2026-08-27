import type { Translator } from '@meith/i18n'
import type { CompiledWordFilter } from '@meith/markdown'
import type { BoardStatsModel, OnlineMemberModel, WhoIsOnlineModel } from '@meith/theme-kit'

import { count } from './count'
import { type MemberIdentity, nameClassOf } from './member-identity'
import { memberHref } from './member-profile'
import { formatTime, untranslated } from './time'
import { filterWords } from './word-filter'

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
  readonly wordFilter?: CompiledWordFilter | undefined
}

export function locationOf(
  row: OnlineRow,
  t: Translator = untranslated(),
  wordFilter?: CompiledWordFilter | undefined,
): { label: string; href: string | null } {
  if (row.threadId !== null && row.threadTitle !== null) {
    return {
      label: t.t('presence.reading', { title: filterWords(row.threadTitle, wordFilter) }),
      href: `/thread/${row.threadId}-${row.threadSlug ?? ''}`,
    }
  }

  if (row.forumId !== null && row.forumTitle !== null) {
    return { label: t.t('presence.viewing', { title: row.forumTitle }), href: `/${row.forumId}` }
  }

  return { label: t.t('presence.somewhere'), href: null }
}

export function buildWhoIsOnlineModel(input: OnlineInput): WhoIsOnlineModel {
  const members: OnlineMemberModel[] = input.members.map((row) => ({
    userId: row.userId,
    username: row.username,
    profileHref: memberHref(row.userId),
    nameClass: nameClassOf(input.identities, row.userId),
    location: locationOf(row, input.t ?? untranslated(), input.wordFilter),
    isInvisible: row.invisible,
    lastSeen: formatTime(row.lastSeenAt, input.now, input.t),
  }))

  return {
    guestCount: count(input.guestCount, input.t),
    members,
    memberCount: count(members.length, input.t),
    total: count(members.length + input.guestCount, input.t),
    recordCount: count(input.recordCount, input.t),
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
    threadCount: count(input.threadCount, input.t),
    postCount: count(input.postCount, input.t),
    memberCount: count(input.memberCount, input.t),
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
