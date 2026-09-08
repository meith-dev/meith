import type { MemberProfileRecord } from '@meith/accounts'
import type { GroupDefaults, MemoryBoard } from '@meith/authorization'
import { emptyPermissionSet, type ForumPermissions, type PermissionSet } from '@meith/core'
import type { ForumListingRow } from '@meith/forums'
import { BodyFormat, quoteBlock } from '@meith/markdown'
import type { PostListingRow } from '@meith/posts'
import { type ThreadListingRow, threadSlug } from '@meith/threads'

import content from './fixture-content.json'

export const SEED_GROUP = {
  guest: 1,
  registered: 2,
  administrators: 3,
  superModerators: 4,
  moderators: 5,
  awaitingActivation: 6,
  banned: 7,
} as const

export const FIXTURE_DATA_VERSION = 5

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

const FORUM_ROWS: ForumListingRow[] = [
  {
    id: SEED_FORUM.main,
    type: 'category',
    allowThreads: false,
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
    allowThreads: true,
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
    allowThreads: true,
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
    allowThreads: true,
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

const THREAD_ROWS: ThreadListingRow[] = [
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

const POST_ROWS: PostListingRow[] = [
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

const MEMBER_PROFILES: MemberProfileRecord[] = [
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

const SNAPSHOT_AT = new Date('2026-07-30T12:00:00Z')
const forumIds = new Map(content.forums.map((forum, index) => [forum.key, 1000 + index]))
const memberIds = new Map(
  content.members.map((member, index) => [member.key, member.key === 'admin' ? 1 : 100 + index]),
)

for (const member of content.members) {
  const id = memberIds.get(member.key)!
  if (id === 1) continue
  MEMBER_PROFILES.push({
    id,
    username: member.username,
    title: 'Members',
    postCount: 0,
    createdAt: new Date(SNAPSHOT_AT.getTime() - member.joinedDaysAgo * 86_400_000),
    lastActiveAt: SNAPSHOT_AT,
    location: member.location,
    website: member.website,
    bio: member.bio,
  })
}

for (const [index, forum] of content.forums.entries()) {
  const id = forumIds.get(forum.key)!
  const parentId = forum.parent === null ? null : forumIds.get(forum.parent)!
  FORUM_ROWS.push({
    id,
    type: forum.type as 'category' | 'forum',
    allowThreads: forum.type === 'forum',
    title: forum.title,
    slug: forum.slug,
    description: 'description' in forum ? forum.description : null,
    parentId,
    path: parentId === null ? String(id) : `${parentId}.${id}`,
    depth: parentId === null ? 0 : 1,
    displayOrder: 10 + index,
    linkUrl: null,
    threadCount: 0,
    postCount: 0,
    lastPost: null,
  })
}

for (const [index, thread] of content.threads.entries()) {
  const id = 1000 + index
  const forumId = forumIds.get(thread.forum)!
  const createdAt = new Date(SNAPSHOT_AT.getTime() - thread.daysAgo * 86_400_000)
  const slug = threadSlug(thread.title)
  const posts: PostListingRow[] = []
  for (const [number, reply] of [{ ...thread, hoursAfter: 0 }, ...thread.replies].entries()) {
    const member = MEMBER_PROFILES.find((profile) => profile.id === memberIds.get(reply.author))!
    const quoted = 'quotes' in reply ? posts[reply.quotes] : undefined
    const message =
      quoted === undefined
        ? reply.message
        : `${quoteBlock({
            author: quoted.authorUsername,
            markdown: quoted.message,
            sourceHref: `/thread/${id}-${slug}?post=${quoted.id}`,
          })}\n\n${reply.message}`
    posts.push({
      id: 1000 + POST_ROWS.length + number,
      threadId: id,
      forumId,
      number: number + 1,
      authorUserId: member.id,
      authorUsername: member.username,
      authorPostCount: 0,
      authorJoinedAt: member.createdAt,
      message,
      messageHtml: null,
      renderVersion: 0,
      bodyFormat: BodyFormat.Markdown,
      editedAt: null,
      editedByUsername: null,
      editReason: null,
      isFirstPost: number === 0,
      visibility: 'visible',
      createdAt: new Date(createdAt.getTime() + reply.hoursAfter * 3_600_000),
    })
  }
  POST_ROWS.push(...posts)
  const first = posts[0]!
  const last = posts.at(-1)!
  const prefix =
    'prefix' in thread ? content.prefixes.find((prefix) => prefix.key === thread.prefix) : undefined
  THREAD_ROWS.push({
    id,
    forumId,
    title: thread.title,
    slug,
    prefix: prefix === undefined ? null : { label: prefix.label, token: prefix.token },
    authorUserId: first.authorUserId,
    authorUsername: first.authorUsername,
    replyCount: posts.length - 1,
    viewCount: posts.length * 37,
    ratingTotal: 0,
    ratingCount: 0,
    visibility: 'visible',
    isSticky: 'sticky' in thread && thread.sticky === true,
    isLocked: 'locked' in thread && thread.locked === true,
    isMoved: false,
    lastPost: {
      postId: last.id,
      userId: last.authorUserId,
      username: last.authorUsername,
      at: last.createdAt,
    },
    lastPostAt: last.createdAt,
  })
}

export const SEED_THREAD_ROWS: readonly ThreadListingRow[] = THREAD_ROWS
export const SEED_MEMBER_PROFILES: readonly MemberProfileRecord[] = MEMBER_PROFILES.map(
  (member) => ({
    ...member,
    postCount: POST_ROWS.filter((post) => post.authorUserId === member.id).length,
  }),
)
export const SEED_POST_ROWS: readonly PostListingRow[] = POST_ROWS.map((post) => ({
  ...post,
  authorPostCount:
    SEED_MEMBER_PROFILES.find((member) => member.id === post.authorUserId)?.postCount ?? 0,
}))
export const SEED_FORUM_ROWS: readonly ForumListingRow[] = FORUM_ROWS.map((forum) => {
  const beneath = new Set(
    FORUM_ROWS.filter(
      (row) => row.path === forum.path || row.path.startsWith(`${forum.path}.`),
    ).map((row) => row.id),
  )
  const posts = POST_ROWS.filter((post) => beneath.has(post.forumId))
  const last = [...posts].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  )[0]
  return {
    ...forum,
    threadCount: THREAD_ROWS.filter((thread) => beneath.has(thread.forumId)).length,
    postCount: posts.length,
    lastPost:
      last === undefined
        ? null
        : {
            postId: last.id,
            threadId: last.threadId,
            threadTitle: THREAD_ROWS.find((thread) => thread.id === last.threadId)!.title,
            userId: last.authorUserId,
            username: last.authorUsername,
            at: last.createdAt,
          },
  }
})

export const SEED_BOARD: MemoryBoard = {
  groups: GROUPS,
  chains: Object.fromEntries(
    SEED_FORUM_ROWS.map((forum) => [forum.id, forum.path.split('.').map(Number).reverse()]),
  ),
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
