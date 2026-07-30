/** F33's public member-profile view and its one canonical route shape. */
import type { MemberProfileRecord } from '@forum/accounts'
import type { MemberProfileModel } from '@forum/theme-kit'

import { formatTime } from './time'

export function memberHref(userId: number): string {
  return `/member/${userId}`
}

export function buildMemberProfileView(
  profile: MemberProfileRecord,
  now: Date,
): MemberProfileModel {
  return {
    user: { userId: profile.id, username: profile.username, profileHref: memberHref(profile.id) },
    avatarUrl: null,
    title: profile.title,
    joinedAt: formatTime(profile.createdAt, now),
    lastVisitAt: profile.lastActiveAt === null ? null : formatTime(profile.lastActiveAt, now),
    postCount: profile.postCount,
    signatureHtml: null,
    fields: [],
    actions: [],
  }
}
