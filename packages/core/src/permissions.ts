export type PermissionKind = 'boolean' | 'numeric' | 'negative'

export type PermissionScope =
  | 'global'
  | 'forum'

export interface PermissionField {
  readonly key: string
  readonly kind: PermissionKind
  readonly scope: PermissionScope
  readonly fallback: boolean | number
  readonly description: string
}

export const PERMISSION_FIELDS = [
  {
    key: 'canView',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description:
      'See the forum exists. False makes it invisible everywhere per R4.2 — ' +
      'index, jump box, search, feeds, and ancestors\u2019 last-post columns.',
  },
  {
    key: 'canViewThreads',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description:
      'Open threads inside the forum. Separate from canView so a forum can be ' +
      'listed as a teaser while its contents stay private.',
  },
  {
    key: 'canViewOthersThreads',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description:
      'See threads started by other users. False yields a "your threads only" ' +
      'forum, used for support desks and applications.',
  },
  {
    key: 'canSearch',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Include this forum in search results.',
  },

  {
    key: 'canPostThreads',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Start new threads.',
  },
  {
    key: 'canPostReplies',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Reply to existing threads.',
  },
  {
    key: 'canPostPolls',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Attach a poll to a new thread.',
  },
  {
    key: 'canVotePolls',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Vote in polls.',
  },
  {
    key: 'canRateThreads',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Rate threads.',
  },

  {
    key: 'canEditOwnPosts',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Edit your own posts, subject to editTimeLimitMinutes.',
  },
  {
    key: 'canDeleteOwnPosts',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Delete your own posts.',
  },
  {
    key: 'canDeleteOwnThreads',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Delete a whole thread you started.',
  },

  {
    key: 'canEditOthersPosts',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description:
      'Edit anyone\u2019s post. Normally granted via forum_moderators rather ' +
      'than a group default.',
  },
  {
    key: 'canDeleteOthersPosts',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Hard-delete anyone\u2019s post.',
  },
  {
    key: 'canSoftDeletePosts',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description:
      'Move a post to visibility=deleted, which is reversible. Distinct from ' +
      'canDeleteOthersPosts, which destroys the row.',
  },
  {
    key: 'canViewUnapproved',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'See content with visibility=unapproved awaiting a moderator.',
  },
  {
    key: 'canViewDeleted',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'See content with visibility=deleted.',
  },
  {
    key: 'canApproveContent',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Move unapproved content to visible.',
  },

  {
    key: 'canUploadAttachments',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Attach files to a post.',
  },
  {
    key: 'canDownloadAttachments',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Download attachments posted by others.',
  },

  {
    key: 'canSubscribe',
    kind: 'boolean',
    scope: 'forum',
    fallback: false,
    description: 'Subscribe to a forum or thread for notifications.',
  },

  {
    key: 'canViewProfiles',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'View member profiles.',
  },
  {
    key: 'canViewMemberList',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Browse the member list.',
  },
  {
    key: 'canUsePrivateMessages',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Send and receive private messages.',
  },
  {
    key: 'canUseSignature',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Display a signature under posts.',
  },
  {
    key: 'canUploadAvatar',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Upload a custom avatar.',
  },
  {
    key: 'canReportContent',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Report a post to moderators.',
  },
  {
    key: 'canViewBoardOffline',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Reach the board while it is in maintenance mode.',
  },
  {
    key: 'canBypassFloodCheck',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Exempt from the between-posts flood interval.',
  },
  {
    key: 'canAccessModCp',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Reach the moderator control panel.',
  },
  {
    key: 'canWarnUsers',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Issue and revoke warnings against members.',
  },

  {
    key: 'isSuperModerator',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description:
      'Bypasses forum permissions but NOT admin-only actions. Every bypass is ' +
      'logged by the Authorizer.',
  },
  {
    key: 'isAdministrator',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description:
      'Bypasses forum permissions entirely, including admin-only actions. ' +
      'Every bypass is logged.',
  },
  {
    key: 'canAccessAdminCp',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description:
      'Reach the admin control panel. Kept separate from isAdministrator so a ' +
      'trusted role can be granted the panel without the permission bypass.',
  },

  {
    key: 'maxPostsPerDay',
    kind: 'numeric',
    scope: 'global',
    fallback: 0,
    description: 'Daily post cap. 0 = unlimited.',
  },
  {
    key: 'editTimeLimitMinutes',
    kind: 'numeric',
    scope: 'forum',
    fallback: 0,
    description:
      'Window during which a user may edit their own post. 0 = unlimited, so ' +
      'a group with 0 lets its members edit forever regardless of other groups.',
  },
  {
    key: 'maxAttachmentsPerPost',
    kind: 'numeric',
    scope: 'forum',
    fallback: 0,
    description: 'Attachment count cap per post. 0 = unlimited.',
  },
  {
    key: 'maxAttachmentSizeKb',
    kind: 'numeric',
    scope: 'forum',
    fallback: 0,
    description: 'Per-file size cap in KiB. 0 = unlimited.',
  },
  {
    key: 'maxPrivateMessagesPerDay',
    kind: 'numeric',
    scope: 'global',
    fallback: 0,
    description: 'Daily PM send cap. 0 = unlimited.',
  },
  {
    key: 'canGiveReputation',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description:
      'Rate other members (F62). Global like canReportContent: reputation is ' +
      'a board-wide capability, so it is not in the F22 forum matrix.',
  },
  {
    key: 'maxReputationPerDay',
    kind: 'numeric',
    scope: 'global',
    fallback: 0,
    description: 'Daily cap on ratings given. 0 = unlimited.',
  },
  {
    key: 'privateMessageQuota',
    kind: 'numeric',
    scope: 'global',
    fallback: 0,
    description:
      'How many private messages a member may keep. 0 = unlimited. Distinct ' +
      'from maxPrivateMessagesPerDay, which is a send rate: this one is ' +
      'storage, and it is what a full inbox means (F60).',
  },
  {
    key: 'maxSignatureLength',
    kind: 'numeric',
    scope: 'global',
    fallback: 0,
    description: 'Signature length cap in characters. 0 = unlimited.',
  },

  {
    key: 'requiresThreadApproval',
    kind: 'negative',
    scope: 'forum',
    fallback: true,
    description:
      'New threads land as unapproved. AND-combined: membership in any group ' +
      'that does not require approval exempts the user.',
  },
  {
    key: 'requiresPostApproval',
    kind: 'negative',
    scope: 'forum',
    fallback: true,
    description: 'New replies land as unapproved. AND-combined.',
  },
  {
    key: 'requiresApprovalOnEdit',
    kind: 'negative',
    scope: 'forum',
    fallback: true,
    description: 'Editing a visible post sends it back for approval.',
  },
] as const satisfies readonly PermissionField[]

export type PermissionKey = (typeof PERMISSION_FIELDS)[number]['key']

export const FORUM_PERMISSION_FIELDS = PERMISSION_FIELDS.filter(
  (f) => f.scope === 'forum',
)

export type ForumPermissionKey = Extract<
  (typeof PERMISSION_FIELDS)[number],
  { scope: 'forum' }
>['key']

export const PERMISSION_FIELD_BY_KEY: Record<string, PermissionField> =
  Object.fromEntries(PERMISSION_FIELDS.map((f) => [f.key, f]))

export type PermissionSet = {
  [K in PermissionKey]: Extract<
    (typeof PERMISSION_FIELDS)[number],
    { key: K }
  >['kind'] extends 'numeric'
    ? number
    : boolean
}

export type ForumPermissions = Pick<PermissionSet, ForumPermissionKey>

export function emptyPermissionSet(): PermissionSet {
  const out: Record<string, boolean | number> = {}
  for (const f of PERMISSION_FIELDS) out[f.key] = f.fallback
  return out as PermissionSet
}
