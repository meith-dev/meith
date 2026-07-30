/**
 * The default in-memory board used when `DATA_SOURCE=fixture`.
 *
 * This is the app's *own* demo/dev data, intentionally separate from the F22
 * test fixture in `@forum/authorization`. The F22 board is tuned to exercise
 * every matrix cell; this one is tuned to be a believable little forum you can
 * click around in with no database attached. Coupling the two would mean a tweak
 * to a permission test could silently change what a demo visitor sees.
 *
 * Group IDs mirror the seed migration's canonical groups so that switching
 * `DATA_SOURCE` from `fixture` to `postgres` does not renumber anything.
 */
import {
  emptyPermissionSet,
  type ForumPermissions,
  type PermissionSet,
} from '@forum/core'
import type { GroupDefaults, MemoryBoard } from '@forum/authorization'
import type { ForumListingRow } from '@forum/forums'
import type { PostListingRow } from '@forum/posts'
import type { ThreadListingRow } from '@forum/threads'
import type { MemberProfileRecord } from '@forum/accounts'

/** Canonical seed groups (must match the seed migration). */
/**
 * Ids must match migration `0001_seed_usergroups`, which is asserted by
 * `seed-usergroups.test.ts`. If they drift, a fixture actor and a Postgres
 * actor stop resolving to the same permissions and every parity assumption in
 * the suite quietly stops meaning anything.
 *
 * `moderators`, `awaitingActivation` and `banned` have no entry in `SEED_BOARD`
 * below — the fixture board only models the permission sets the in-memory
 * authorization tests need. They are named here because code outside the
 * fixture (the ban service, the promotion guards) has to refer to them by id.
 */
export const SEED_GROUP = {
  guest: 1,
  registered: 2,
  administrators: 3,
  superModerators: 4,
  moderators: 5,
  awaitingActivation: 6,
  banned: 7,
} as const

/** Bump when the read-only fixture rows change so a live dev container refreshes. */
export const FIXTURE_DATA_VERSION = 3

/** Canonical seed forums. */
export const SEED_FORUM = {
  /**
   * The category the two top-level forums sit under (F29).
   *
   * A category is a forum row of `type: 'category'`: it holds no threads and
   * renders as the heading of a block on the index. It carries no permission
   * overrides, so it changes no resolution — every ancestor walk through it
   * finds no row and inherits, which is the nullable-column inheritance F21
   * already tests. It exists so the fixture board has the shape a real board
   * has, rather than two orphan forums the index has to invent a heading for.
   */
  community: 10,
  announcements: 100,
  general: 200,
  generalOffTopic: 201, // child of general
} as const

function group(over: Partial<PermissionSet>): PermissionSet {
  return { ...emptyPermissionSet(), ...over }
}

const READ = {
  canView: true,
  canViewThreads: true,
  canViewOthersThreads: true,
  canSearch: true,
  canViewProfiles: true,
} as const

const POST = {
  ...READ,
  canPostThreads: true,
  canPostReplies: true,
  canSubscribe: true,
  /*
   * F41. A member who cannot correct their own typo is not a forum, so this is
   * the baseline every real board ships with — and the fixture has to have it
   * for the edit affordances to appear at all. The *window* is the permission
   * that limits it (`editTimeLimitMinutes`), and it is 0 here: unlimited.
   */
  canEditOwnPosts: true,
  canDeleteOwnPosts: true,
  /*
   * The three negative fields, matching migration `0001_seed_usergroups`.
   *
   * They were missing here, and the fixture inherited `emptyPermissionSet()`'s
   * fallback — which for a negative field is the *restrictive* value (R4.2), so
   * the fixture's Registered group required approval for everything while the
   * seeded Postgres group required approval for nothing. Nothing read them
   * until F41, at which point every edit on the fixture board silently went to
   * a queue that has no screen. The fixture claims to mirror the seeded ladder;
   * now it does.
   */
  requiresThreadApproval: false,
  requiresPostApproval: false,
  requiresApprovalOnEdit: false,
} as const

const GROUPS: GroupDefaults[] = [
  { groupId: SEED_GROUP.guest, permissions: group(READ) },
  {
    groupId: SEED_GROUP.registered,
    permissions: group({ ...POST, canUploadAttachments: true }),
  },
  {
    groupId: SEED_GROUP.administrators,
    permissions: group({
      ...POST,
      canUploadAttachments: true,
      isAdministrator: true,
      canAccessAdminCp: true,
      canAccessModCp: true,
    }),
  },
  {
    groupId: SEED_GROUP.superModerators,
    permissions: group({
      ...POST,
      canUploadAttachments: true,
      isSuperModerator: true,
      canAccessModCp: true,
    }),
  },
]

/** Announcements: everyone reads, only staff post (guests/registered read-only). */
const ANNOUNCEMENT_READONLY: Partial<ForumPermissions> = {
  canPostThreads: false,
  canPostReplies: false,
}

export const SEED_BOARD: MemoryBoard = {
  groups: GROUPS,
  /*
   * Nearest-first and inclusive, per the port contract. Every chain now ends at
   * the category, which is what makes the ancestor walk in the fixture match the
   * one Postgres derives from `path`.
   */
  chains: {
    [SEED_FORUM.community]: [SEED_FORUM.community],
    [SEED_FORUM.announcements]: [SEED_FORUM.announcements, SEED_FORUM.community],
    [SEED_FORUM.general]: [SEED_FORUM.general, SEED_FORUM.community],
    [SEED_FORUM.generalOffTopic]: [
      SEED_FORUM.generalOffTopic,
      SEED_FORUM.general,
      SEED_FORUM.community,
    ],
  },
  overrides: [
    {
      forumId: SEED_FORUM.announcements,
      groupId: SEED_GROUP.guest,
      overrides: ANNOUNCEMENT_READONLY,
    },
    {
      forumId: SEED_FORUM.announcements,
      groupId: SEED_GROUP.registered,
      overrides: ANNOUNCEMENT_READONLY,
    },
  ],
}

/* ------------------------------------------------------------------ *
 * Forum rows (F29)
 * ------------------------------------------------------------------ */

/**
 * The demo board's forum rows, with the counters and last-post triplet the
 * index renders.
 *
 * Fixed timestamps rather than `Date.now()` offsets: a fixture whose dates move
 * with the clock makes "2 hours ago" render differently on every run, so a
 * snapshot or a screenshot diff is never stable, and a test that happens to pass
 * at 09:00 fails at midnight. The board index formats these in UTC (see
 * `src/view/time.ts`), so what is rendered is a function of this file alone.
 *
 * `path` and `depth` are spelled out to match what Postgres would derive, so
 * switching `DATA_SOURCE` changes the data source and nothing else — the same
 * reason the group ids mirror the seed migration.
 */
export const SEED_FORUM_ROWS: readonly ForumListingRow[] = [
  {
    id: SEED_FORUM.community,
    type: 'category',
    title: 'Community',
    slug: 'community',
    description: null,
    parentId: null,
    path: '10',
    depth: 0,
    displayOrder: 1,
    linkUrl: null,
    // A category holds no threads; its counters are always zero.
    threadCount: 0,
    postCount: 0,
    lastPost: null,
  },
  {
    id: SEED_FORUM.announcements,
    type: 'forum',
    title: 'Announcements',
    slug: 'announcements',
    description: 'Board news and release notes. Staff post, everyone reads.',
    parentId: SEED_FORUM.community,
    path: '10.100',
    depth: 1,
    displayOrder: 1,
    linkUrl: null,
    threadCount: 1,
    postCount: 2,
    lastPost: {
      postId: 11,
      threadId: 4,
      threadTitle: 'Version 0.1 is live',
      userId: 1,
      username: 'admin',
      at: new Date('2026-07-29T14:05:00Z'),
    },
  },
  {
    id: SEED_FORUM.general,
    type: 'forum',
    title: 'General Discussion',
    slug: 'general',
    description: 'Anything and everything.',
    parentId: SEED_FORUM.community,
    path: '10.200',
    depth: 1,
    displayOrder: 2,
    linkUrl: null,
    threadCount: 2,
    postCount: 4,
    lastPost: {
      postId: 143,
      threadId: 22,
      threadTitle: 'What are you reading this week?',
      /*
       * A deleted account: the id is gone, the name survives. The row must still
       * render — this is the case that turns a listing into a crash if the view
       * model assumes an author is always linkable.
       */
      userId: null,
      username: 'departed',
      at: new Date('2026-07-30T08:41:00Z'),
    },
  },
  {
    id: SEED_FORUM.generalOffTopic,
    type: 'forum',
    title: 'Off Topic',
    slug: 'off-topic',
    description: 'Everything else.',
    parentId: SEED_FORUM.general,
    path: '10.200.201',
    depth: 2,
    displayOrder: 1,
    linkUrl: null,
    // No posts yet: the empty-state path through the row, deliberately present.
    threadCount: 0,
    postCount: 0,
    lastPost: null,
  },
]

/** Threads for the fixture forum display (F30). */
export const SEED_THREAD_ROWS: readonly ThreadListingRow[] = [
  {
    id: 4,
    forumId: SEED_FORUM.announcements,
    title: 'Version 0.1 is live',
    slug: 'version-0-1-is-live',
    prefix: null,
    authorUserId: 1,
    authorUsername: 'admin',
    replyCount: 1,
    viewCount: 64,
    visibility: 'visible',
    isSticky: false,
    isLocked: false,
    isMoved: false,
    lastPost: {
      postId: 11,
      userId: 1,
      username: 'admin',
      at: new Date('2026-07-29T14:05:00Z'),
    },
    lastPostAt: new Date('2026-07-29T14:05:00Z'),
  },
  {
    id: 22,
    forumId: SEED_FORUM.general,
    title: 'What are you reading this week?',
    slug: 'what-are-you-reading-this-week',
    prefix: { label: 'Weekly', token: null },
    authorUserId: null,
    authorUsername: 'departed',
    replyCount: 1,
    viewCount: 241,
    visibility: 'visible',
    isSticky: true,
    isLocked: false,
    isMoved: false,
    lastPost: {
      postId: 143,
      userId: null,
      username: 'departed',
      at: new Date('2026-07-30T08:41:00Z'),
    },
    lastPostAt: new Date('2026-07-30T08:41:00Z'),
  },
  {
    id: 21,
    forumId: SEED_FORUM.general,
    title: 'Show us your desk setup',
    slug: 'show-us-your-desk-setup',
    prefix: null,
    authorUserId: 1,
    authorUsername: 'admin',
    replyCount: 1,
    viewCount: 116,
    visibility: 'visible',
    isSticky: false,
    isLocked: false,
    isMoved: false,
    lastPost: {
      postId: 132,
      userId: 1,
      username: 'admin',
      at: new Date('2026-07-29T17:18:00Z'),
    },
    lastPostAt: new Date('2026-07-29T17:18:00Z'),
  },
]

/** Visible posts for the fixture thread view (F31). */
export const SEED_POST_ROWS: readonly PostListingRow[] = [
  {
    id: 10,
    threadId: 4,
    forumId: SEED_FORUM.announcements,
    number: 1,
    authorUserId: 1,
    authorUsername: 'admin',
    authorPostCount: 5,
    authorJoinedAt: new Date('2026-01-01T00:00:00Z'),
    message:
      'Welcome to the [b]new forum[/b]. We are glad you are here.\n\n' +
      'The rules live at [url=/forum/100-announcements]Announcements[/url].',
    messageHtml: null,
    renderVersion: 0,
    editedAt: null,
    editedByUsername: null,
    editReason: null,
    isFirstPost: true,
    visibility: 'visible',
    createdAt: new Date('2026-07-29T09:00:00Z'),
  },
  {
    id: 11,
    threadId: 4,
    forumId: SEED_FORUM.announcements,
    number: 2,
    authorUserId: 1,
    authorUsername: 'admin',
    authorPostCount: 5,
    authorJoinedAt: new Date('2026-01-01T00:00:00Z'),
    message: 'Thanks for joining us for the first release.',
    messageHtml: null,
    renderVersion: 0,
    editedAt: null,
    editedByUsername: null,
    editReason: null,
    isFirstPost: false,
    visibility: 'visible',
    createdAt: new Date('2026-07-29T14:05:00Z'),
  },
  {
    id: 121,
    threadId: 21,
    forumId: SEED_FORUM.general,
    number: 1,
    authorUserId: 1,
    authorUsername: 'admin',
    authorPostCount: 5,
    authorJoinedAt: new Date('2026-01-01T00:00:00Z'),
    message: 'Show us the place where you make things.',
    messageHtml: null,
    renderVersion: 0,
    editedAt: null,
    editedByUsername: null,
    editReason: null,
    isFirstPost: true,
    visibility: 'visible',
    createdAt: new Date('2026-07-29T12:00:00Z'),
  },
  {
    id: 132,
    threadId: 21,
    forumId: SEED_FORUM.general,
    number: 2,
    authorUserId: 1,
    authorUsername: 'admin',
    authorPostCount: 5,
    authorJoinedAt: new Date('2026-01-01T00:00:00Z'),
    message: "[quote='admin' pid='121']Show us the place where you make things.[/quote]\nA standing desk and a notebook are all I need.",
    messageHtml: null,
    renderVersion: 0,
    editedAt: null,
    editedByUsername: null,
    editReason: null,
    isFirstPost: false,
    visibility: 'visible',
    createdAt: new Date('2026-07-29T17:18:00Z'),
  },
  {
    id: 133,
    threadId: 22,
    forumId: SEED_FORUM.general,
    number: 1,
    authorUserId: 1,
    authorUsername: 'admin',
    authorPostCount: 5,
    authorJoinedAt: new Date('2026-01-01T00:00:00Z'),
    message: 'Tell us what you are reading this week.',
    messageHtml: null,
    renderVersion: 0,
    editedAt: null,
    editedByUsername: null,
    editReason: null,
    isFirstPost: true,
    visibility: 'visible',
    createdAt: new Date('2026-07-28T09:00:00Z'),
  },
  {
    id: 143,
    threadId: 22,
    forumId: SEED_FORUM.general,
    number: 2,
    authorUserId: null,
    authorUsername: 'departed',
    authorPostCount: 0,
    authorJoinedAt: null,
    message: 'I just started a mystery novel.',
    messageHtml: null,
    renderVersion: 0,
    editedAt: null,
    editedByUsername: null,
    editReason: null,
    isFirstPost: false,
    visibility: 'visible',
    createdAt: new Date('2026-07-30T08:41:00Z'),
  },
]

/** Public fixture profiles. Deleted post authors deliberately have no row here. */
export const SEED_MEMBER_PROFILES: readonly MemberProfileRecord[] = [
  {
    id: 1,
    username: 'admin',
    title: 'Administrators',
    postCount: 5,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastActiveAt: new Date('2026-07-30T08:41:00Z'),
  },
]
