/**
 * The permission model, declared once.
 *
 * R4.2 gives three different combination rules depending on a field's *kind*,
 * and R4.1 says the same fields appear in two places: global defaults on
 * `usergroups`, and nullable per-community overrides on `community_permissions`. If the
 * field list were written out in each of those places it would be written three
 * times (schema, schema again, combination logic) and would drift on the first
 * feature that adds a permission.
 *
 * So the list lives here, in `@meith/core`, as data:
 *
 *   - `packages/db` generates both tables' columns from it
 *   - `packages/authorization` drives the combination rules from `kind`
 *   - the F22 gate enumerates it, so adding a field fails the suite until the
 *     fixture is extended (exactly what F22's acceptance criteria demand)
 *
 * This file must not import anything. It is the floor of the dependency graph.
 */

/**
 * How a field combines across the several groups a user belongs to.
 *
 * - `boolean`  — OR. Most-permissive wins. Being added to a group can only ever
 *                grant, never take away.
 * - `numeric`  — MAX, but `0` means "unlimited" and therefore beats every other
 *                value. Naive `Math.max` gets this exactly backwards, which is
 *                why the rule is encoded here rather than left to each call site.
 * - `negative` — AND. The field's `true` state is a *restriction*
 *                (`requiresPostApproval`), so any group that exempts the user
 *                exempts them everywhere.
 */
export type PermissionKind = 'boolean' | 'numeric' | 'negative'

/** Where a field may be set. */
export type PermissionScope =
  /** Global group default only. Meaningless per-community (e.g. "can use PMs"). */
  | 'global'
  /** Both a global default and a nullable per-community override. */
  | 'community'

export interface PermissionField {
  readonly key: string
  readonly kind: PermissionKind
  readonly scope: PermissionScope
  /**
   * The value used when no group grants anything — deny by default. For
   * `negative` fields the safe default is `true` (restricted).
   */
  readonly fallback: boolean | number
  readonly description: string
}

/**
 * Actions are the vocabulary callers use; permission fields are the storage.
 * They are close but not identical: `editOthers` consults a field *and* a
 * moderator right. The mapping lives in `packages/authorization`.
 */
export const PERMISSION_FIELDS = [
  /* ---- Visibility (community-scoped) ---- */
  {
    key: 'canView',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description:
      'See the community exists. False makes it invisible everywhere per R4.2 — ' +
      'index, jump box, search, feeds, and ancestors\u2019 last-post columns.',
  },
  {
    key: 'canViewThreads',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description:
      'Open threads inside the community. Separate from canView so a community can be ' +
      'listed as a teaser while its contents stay private.',
  },
  {
    key: 'canViewOthersThreads',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description:
      'See threads started by other users. False yields a "your threads only" ' +
      'community, used for support desks and applications.',
  },
  {
    key: 'canSearch',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Include this community in search results.',
  },

  /* ---- Posting (community-scoped) ---- */
  {
    key: 'canPostThreads',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Start new threads.',
  },
  {
    key: 'canPostReplies',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Reply to existing threads.',
  },
  {
    key: 'canPostPolls',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Attach a poll to a new thread.',
  },
  {
    key: 'canVotePolls',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Vote in polls.',
  },
  {
    key: 'canRateThreads',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Rate threads.',
  },

  /* ---- Editing and deleting own content (community-scoped) ---- */
  {
    key: 'canEditOwnPosts',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Edit your own posts, subject to editTimeLimitMinutes.',
  },
  {
    key: 'canDeleteOwnPosts',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Delete your own posts.',
  },
  {
    key: 'canDeleteOwnThreads',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Delete a whole thread you started.',
  },

  /* ---- Moderation-ish, still community-scoped ---- */
  {
    key: 'canEditOthersPosts',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description:
      'Edit anyone\u2019s post. Normally granted via community_moderators rather ' +
      'than a group default.',
  },
  {
    key: 'canDeleteOthersPosts',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Hard-delete anyone\u2019s post.',
  },
  {
    key: 'canSoftDeletePosts',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description:
      'Move a post to visibility=deleted, which is reversible. Distinct from ' +
      'canDeleteOthersPosts, which destroys the row.',
  },
  {
    key: 'canViewUnapproved',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'See content with visibility=unapproved awaiting a moderator.',
  },
  {
    key: 'canViewDeleted',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'See content with visibility=deleted.',
  },
  {
    key: 'canApproveContent',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Move unapproved content to visible.',
  },

  /* ---- Attachments (community-scoped) ---- */
  {
    key: 'canUploadAttachments',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Attach files to a post.',
  },
  {
    key: 'canDownloadAttachments',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Download attachments posted by others.',
  },

  /* ---- Subscriptions (community-scoped) ---- */
  {
    key: 'canSubscribe',
    kind: 'boolean',
    scope: 'community',
    fallback: false,
    description: 'Subscribe to a community or thread for notifications.',
  },

  /* ---- Global-only booleans ---- */
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
    /*
     * F53. Global, like MyBB's `canwarnusers` and for the same reason: a
     * warning is aimed at a *person*, not at content in a community, and points
     * follow them across the whole board. A per-community grant would have to
     * answer "warned where?" about a total that has no community.
     */
    key: 'canWarnUsers',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description: 'Issue and revoke warnings against members.',
  },

  /*
   * The two bypass flags. R4.2 requires these be explicit and logged, never
   * emergent from some other column, which is why they are ordinary declared
   * fields rather than a derived `groupId === 4` test somewhere.
   */
  {
    key: 'isSuperModerator',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description:
      'Bypasses community permissions but NOT admin-only actions. Every bypass is ' +
      'logged by the Authorizer.',
  },
  {
    key: 'isAdministrator',
    kind: 'boolean',
    scope: 'global',
    fallback: false,
    description:
      'Bypasses community permissions entirely, including admin-only actions. ' +
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

  /* ---- Numeric limits. 0 == unlimited and beats everything. ---- */
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
    scope: 'community',
    fallback: 0,
    description:
      'Window during which a user may edit their own post. 0 = unlimited, so ' +
      'a group with 0 lets its members edit forever regardless of other groups.',
  },
  {
    key: 'maxAttachmentsPerPost',
    kind: 'numeric',
    scope: 'community',
    fallback: 0,
    description: 'Attachment count cap per post. 0 = unlimited.',
  },
  {
    key: 'maxAttachmentSizeKb',
    kind: 'numeric',
    scope: 'community',
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
      'a board-wide capability, so it is not in the F22 community matrix.',
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
  /*
   * NOTE: MyBB has a per-group `searchfloodtime`. It is deliberately absent.
   * R4.2 combines numerics with MAX and treats 0 as unlimited, but a flood
   * *interval* is most permissive at its SMALLEST non-zero value, so it cannot
   * obey the rule without inverting it for one field. Modelled instead as the
   * board setting `search.flood_seconds` plus the existing `canBypassFloodCheck`
   * boolean, which combines correctly. See docs/mybb-parity.md#flood-intervals.
   */

  /* ---- Negative-sense flags. AND across groups. ---- */
  {
    key: 'requiresThreadApproval',
    kind: 'negative',
    scope: 'community',
    fallback: true,
    description:
      'New threads land as unapproved. AND-combined: membership in any group ' +
      'that does not require approval exempts the user.',
  },
  {
    key: 'requiresPostApproval',
    kind: 'negative',
    scope: 'community',
    fallback: true,
    description: 'New replies land as unapproved. AND-combined.',
  },
  {
    key: 'requiresApprovalOnEdit',
    kind: 'negative',
    scope: 'community',
    fallback: true,
    description: 'Editing a visible post sends it back for approval.',
  },
] as const satisfies readonly PermissionField[]

export type PermissionKey = (typeof PERMISSION_FIELDS)[number]['key']

/** Fields that may be overridden per community (R4.1 layer 2). */
export const COMMUNITY_PERMISSION_FIELDS = PERMISSION_FIELDS.filter(
  (f) => f.scope === 'community',
)

export type CommunityPermissionKey = Extract<
  (typeof PERMISSION_FIELDS)[number],
  { scope: 'community' }
>['key']

/** Lookup by key, built once. */
export const PERMISSION_FIELD_BY_KEY: Record<string, PermissionField> =
  Object.fromEntries(PERMISSION_FIELDS.map((f) => [f.key, f]))

/**
 * The fully-resolved global permission set for an actor.
 * Booleans and negatives are `boolean`; limits are `number`.
 */
export type PermissionSet = {
  [K in PermissionKey]: Extract<
    (typeof PERMISSION_FIELDS)[number],
    { key: K }
  >['kind'] extends 'numeric'
    ? number
    : boolean
}

/** The community-scoped subset, as returned by `Authorizer.communityMatrix()`. */
export type CommunityPermissions = Pick<PermissionSet, CommunityPermissionKey>

/** Deny-by-default permission set, used as the reduction seed. */
export function emptyPermissionSet(): PermissionSet {
  const out: Record<string, boolean | number> = {}
  for (const f of PERMISSION_FIELDS) out[f.key] = f.fallback
  return out as PermissionSet
}
