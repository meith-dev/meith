import type { MybbForum, MybbPost, MybbThread, MybbUser } from './source'

export interface ImportedUser {
  readonly legacyId: number
  readonly username: string
  readonly email: string
  readonly legacyPasswordHash: string
  readonly registeredAt: Date
  readonly lastVisitAt: Date | null
  readonly postCount: number
  readonly legacyGroupId: number
}

export interface ImportedForum {
  readonly legacyId: number
  readonly type: 'category' | 'forum' | 'link'
  readonly title: string
  readonly description: string | null
  readonly legacyParentId: number | null
  readonly displayOrder: number
  readonly linkUrl: string | null
}

export type Visibility = 'visible' | 'unapproved' | 'deleted'

export interface ImportedThread {
  readonly legacyId: number
  readonly legacyForumId: number
  readonly title: string
  readonly legacyAuthorId: number
  readonly authorUsername: string
  readonly createdAt: Date
  readonly lastPostAt: Date
  readonly replyCount: number
  readonly viewCount: number
  readonly isSticky: boolean
  readonly isLocked: boolean
  readonly visibility: Visibility
}

export interface ImportedPost {
  readonly legacyId: number
  readonly legacyThreadId: number
  readonly legacyForumId: number
  readonly legacyAuthorId: number
  readonly authorUsername: string
  readonly body: string
  readonly createdAt: Date
  readonly editedAt: Date | null
  readonly visibility: Visibility
}

export function fromUnixSeconds(seconds: number): Date | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(seconds * 1000)
}

export function visibilityOf(visible: number): Visibility {
  if (visible === 1) return 'visible'
  if (visible === -1) return 'deleted'
  return 'unapproved'
}

export function mapUser(row: MybbUser): ImportedUser {
  return {
    legacyId: row.uid,
    username: row.username,
    email: row.email.trim().toLowerCase(),
    legacyPasswordHash: `mybb$${row.salt}$${row.password}`,
    registeredAt: fromUnixSeconds(row.regdate) ?? new Date(0),
    lastVisitAt: fromUnixSeconds(row.lastvisit),
    postCount: Math.max(0, row.postnum),
    legacyGroupId: row.usergroup,
  }
}

const FORUM_TYPES: Readonly<Record<string, ImportedForum['type']>> = {
  f: 'forum',
  c: 'category',
  l: 'link',
}

export function mapForum(row: MybbForum): ImportedForum {
  return {
    legacyId: row.fid,
    type: FORUM_TYPES[row.type] ?? 'forum',
    title: row.name,
    description: row.description.trim() === '' ? null : row.description,
    legacyParentId: row.pid === 0 ? null : row.pid,
    displayOrder: row.disporder,
    linkUrl: row.type === 'l' && row.linkto.trim() !== '' ? row.linkto : null,
  }
}

export function mapThread(row: MybbThread): ImportedThread {
  const createdAt = fromUnixSeconds(row.dateline) ?? new Date(0)

  return {
    legacyId: row.tid,
    legacyForumId: row.fid,
    title: row.subject,
    legacyAuthorId: row.uid,
    authorUsername: row.username,
    createdAt,
    lastPostAt: fromUnixSeconds(row.lastpost) ?? createdAt,
    replyCount: Math.max(0, row.replies),
    viewCount: Math.max(0, row.views),
    isSticky: row.sticky === 1,
    isLocked: row.closed === '1',
    visibility: visibilityOf(row.visible),
  }
}

export function mapPost(row: MybbPost): ImportedPost {
  return {
    legacyId: row.pid,
    legacyThreadId: row.tid,
    legacyForumId: row.fid,
    legacyAuthorId: row.uid,
    authorUsername: row.username,
    body: row.message,
    createdAt: fromUnixSeconds(row.dateline) ?? new Date(0),
    editedAt: row.edituid === 0 ? null : fromUnixSeconds(row.edittime),
    visibility: visibilityOf(row.visible),
  }
}
