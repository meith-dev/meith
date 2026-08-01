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
  options: {
    /**
     * Whether the viewer may warn this member (F53).
     *
     * A capability the page resolves, not a permission this function knows: the
     * matrix stays in `@forum/authorization` (R4), and the action behind the
     * link re-asks anyway.
     */
    readonly canWarn?: boolean
    /** The *viewer's* timezone (F57), not the profile owner's. */
    readonly timeZone?: string
    /**
     * F59's custom fields, already resolved for this viewer.
     *
     * Resolved by the page rather than here, because visibility is a
     * per-group question and this is a pure function — the same division F53's
     * `canWarn` follows.
     */
    readonly customFields?: readonly { readonly label: string; readonly value: string }[]
    /**
     * Whether the viewer may write to this member (F60).
     *
     * Resolved by the page, like `canWarn`, and for the same reason. It is
     * `pm.use` on the *viewer* only: whether the recipient can receive is a
     * question the send path asks with a fresh answer, and a profile that hid
     * the link for a member whose store is momentarily full would be a worse
     * lie than a send that explains itself.
     */
    readonly canMessage?: boolean
  } = {},
): MemberProfileModel {
  const { canWarn = false, canMessage = false, timeZone, customFields = [] } = options
  return {
    user: { userId: profile.id, username: profile.username, profileHref: memberHref(profile.id) },
    avatarUrl: null,
    title: profile.title,
    joinedAt: formatTime(profile.createdAt, now, timeZone),
    lastVisitAt:
      profile.lastActiveAt === null
        ? null
        : formatTime(profile.lastActiveAt, now, timeZone),
    postCount: profile.postCount,
    signatureHtml: null,
    /*
     * F57's three self-written fields, in the slot F59 will later fill with
     * configured ones. They travel as `{label, value}` pairs and are **plain
     * text**: `MemberProfileModel.fields` is rendered as text by the theme, and
     * a profile that could carry markup is a stored-XSS vector on a page every
     * member visits. Absent fields are omitted rather than rendered empty —
     * F33's rule that an invisible field is not in the HTML at all.
     */
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
              /* The username, not the id: the composer resolves names, which is
                 also what a member typing one by hand supplies. */
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
