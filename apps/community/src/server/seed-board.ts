import { BodyFormat } from '@meith/markdown'
import {
  emptyPermissionSet,
  type ForumPermissions,
  type PermissionSet,
} from '@meith/core'
import type { GroupDefaults, MemoryBoard } from '@meith/authorization'
import type { ForumListingRow } from '@meith/forums'
import type { PostListingRow } from '@meith/posts'
import type { ThreadListingRow } from '@meith/threads'
import type { MemberProfileRecord } from '@meith/accounts'

export const SEED_GROUP = {
  guest: 1,
  registered: 2,
  administrators: 3,
  superModerators: 4,
  moderators: 5,
  awaitingActivation: 6,
  banned: 7,
} as const

export const FIXTURE_DATA_VERSION = 4

export const SEED_FORUM = {
  main: 10,
  announcements: 100,
  general: 200,
  generalOffTopic: 201,
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
  canDownloadAttachments: true,
} as const

const POST = {
  ...READ,
  canPostThreads: true,
  canPostReplies: true,
  canSubscribe: true,
  canEditOwnPosts: true,
  canDeleteOwnPosts: true,
  canReportContent: true,
  canUploadAvatar: true,
  canUsePrivateMessages: true,
  privateMessageQuota: 100,
  canGiveReputation: true,
  maxReputationPerDay: 10,
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

const ANNOUNCEMENT_READONLY: Partial<ForumPermissions> = {
  canPostThreads: false,
  canPostReplies: false,
}

export const SEED_BOARD: MemoryBoard = {
  groups: GROUPS,
  chains: {
    [SEED_FORUM.main]: [SEED_FORUM.main],
    [SEED_FORUM.announcements]: [
      SEED_FORUM.announcements,
      SEED_FORUM.main,
    ],
    [SEED_FORUM.general]: [SEED_FORUM.general, SEED_FORUM.main],
    [SEED_FORUM.generalOffTopic]: [
      SEED_FORUM.generalOffTopic,
      SEED_FORUM.general,
      SEED_FORUM.main,
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

export const SEED_FORUM_ROWS: readonly ForumListingRow[] = [
  {
    id: SEED_FORUM.main,
    type: 'category',
    title: 'Main',
    slug: 'main',
    description: null,
    parentId: null,
    path: '10',
    depth: 0,
    displayOrder: 1,
    linkUrl: null,
    threadCount: 3,
    postCount: 6,
    lastPost: {
      postId: 143,
      threadId: 22,
      threadTitle: 'What are you reading this week?',
      userId: null,
      username: 'departed',
      at: new Date('2026-07-30T08:41:00Z'),
    },
  },
  {
    id: SEED_FORUM.announcements,
    type: 'forum',
    title: 'Announcements',
    slug: 'announcements',
    description: 'Board news and release notes. Staff post, everyone reads.',
    parentId: SEED_FORUM.main,
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
    parentId: SEED_FORUM.main,
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
    threadCount: 0,
    postCount: 0,
    lastPost: null,
  },
]

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
    ratingTotal: 0,
    ratingCount: 0,
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
    ratingTotal: 17,
    ratingCount: 4,
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
    ratingTotal: 0,
    ratingCount: 0,
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
      'Welcome to the **new forum**. We are glad you are here.\n\n' +
      'The rules live in [Announcements](/100-announcements).',
    messageHtml: null,
    renderVersion: 0,
    bodyFormat: BodyFormat.Markdown,
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
    bodyFormat: BodyFormat.Markdown,
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
    bodyFormat: BodyFormat.Markdown,
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
    message:
      '> **[admin](/member/by-name/admin) wrote:** ' +
      '[View post](/thread/21-show-us-your-desk-setup?post=121)\n>\n' +
      '> Show us the place where you make things.\n\n' +
      'A standing desk and a notebook are all I need.',
    messageHtml: null,
    renderVersion: 0,
    bodyFormat: BodyFormat.Markdown,
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
    bodyFormat: BodyFormat.Markdown,
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
    bodyFormat: BodyFormat.Markdown,
    editedAt: null,
    editedByUsername: null,
    editReason: null,
    isFirstPost: false,
    visibility: 'visible',
    createdAt: new Date('2026-07-30T08:41:00Z'),
  },
]

export const SEED_MEMBER_PROFILES: readonly MemberProfileRecord[] = [
  {
    id: 1,
    username: 'admin',
    title: 'Administrators',
    postCount: 5,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastActiveAt: new Date('2026-07-30T08:41:00Z'),
    location: 'The server room',
    website: 'https://example.test/',
    bio: 'Runs this board. Fixture data — nothing here is durable.',
  },
]
