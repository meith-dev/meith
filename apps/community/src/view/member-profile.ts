import type { MemberProfileRecord } from '@meith/accounts'
import type { MemberProfileModel } from '@meith/theme-kit'

import { formatDate, formatTime } from './time'

export function memberHref(userId: number): string {
  return `/member/${userId}`
}

export function buildMemberProfileView(
  profile: MemberProfileRecord,
  now: Date,
  options: {
    readonly canWarn?: boolean
    readonly timeZone?: string
    readonly customFields?: readonly { readonly label: string; readonly value: string }[]
    readonly canMessage?: boolean
    readonly avatarUrl?: string | null
    readonly nameClass?: string | null
  } = {},
): MemberProfileModel {
  const {
    canWarn = false,
    canMessage = false,
    timeZone,
    customFields = [],
    avatarUrl = null,
    nameClass = null,
  } = options
  return {
    user: {
      userId: profile.id,
      username: profile.username,
      profileHref: memberHref(profile.id),
      nameClass,
    },
    avatarUrl,
    title: profile.title,
    joinedAt: formatDate(profile.createdAt, timeZone),
    lastVisitAt:
      profile.lastActiveAt === null ? null : formatTime(profile.lastActiveAt, now, timeZone),
    postCount: profile.postCount,
    signatureHtml: null,
    fields: [
      profile.location === null ? null : { label: 'Location', value: profile.location },
      profile.website === null ? null : { label: 'Website', value: profile.website },
      profile.bio === null ? null : { label: 'About', value: profile.bio },
      ...customFields,
    ].filter((field): field is { label: string; value: string } => field !== null),
    actions: [
      ...(canMessage
        ? [
            {
              label: 'Send a message',
              href: `/messages/compose?to=${encodeURIComponent(profile.username)}`,
            },
          ]
        : []),
      ...(canWarn
        ? [{ label: 'Warn this member', href: `/moderation/warn?user=${profile.id}` }]
        : []),
    ],
  }
}
