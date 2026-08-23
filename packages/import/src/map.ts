import type {
  MybbAttachment,
  MybbAvatarRow,
  MybbBan,
  MybbForum,
  MybbForumSubscription,
  MybbPoll,
  MybbPollVote,
  MybbPost,
  MybbPrivateMessage,
  MybbRelationList,
  MybbReputation,
  MybbThread,
  MybbThreadSubscription,
  MybbUser,
  MybbWarning,
} from './mybb-rows'
import type {
  ImportedAttachment,
  ImportedAvatar,
  ImportedBan,
  ImportedForum,
  ImportedPoll,
  ImportedPollVote,
  ImportedPost,
  ImportedPrivateMessage,
  ImportedReputation,
  ImportedSubscription,
  ImportedThread,
  ImportedUser,
  ImportedUserRelation,
  ImportedWarning,
} from './types'
import { fromUnixSeconds, visibilityOf } from './types'

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

const AVATAR_SOURCES: Readonly<Record<string, ImportedAvatar['source']>> = {
  upload: 'upload',
  gallery: 'gallery',
  remote: 'remote',
}

export function mapAvatar(row: MybbAvatarRow): ImportedAvatar | null {
  const source = AVATAR_SOURCES[row.avatartype]
  if (source === undefined) return null

  const path = row.avatar.split('?')[0]?.replace(/^\.\//, '') ?? ''
  if (path === '') return null

  const [width, height] = row.avatardimensions.split('|').map((part) => Number(part))

  return {
    legacyUserId: row.uid,
    source,
    path,
    width: Number.isFinite(width) && width! > 0 ? width! : null,
    height: Number.isFinite(height) && height! > 0 ? height! : null,
  }
}

export function mapAttachment(row: MybbAttachment): ImportedAttachment {
  const path = row.attachname.replace(/^\.\//, '')
  const thumbnail = row.thumbnail.trim()

  return {
    legacyId: row.aid,
    legacyPostId: row.pid,
    legacyUserId: row.uid,
    filename: row.filename,
    contentType: row.filetype.trim() === '' ? null : row.filetype.trim(),
    sizeBytes: Math.max(0, row.filesize),
    path,
    thumbnailPath:
      thumbnail === '' || thumbnail === 'SMALL' ? null : thumbnail.replace(/^\.\//, ''),
    downloadCount: Math.max(0, row.downloads),
    createdAt: fromUnixSeconds(row.dateuploaded) ?? new Date(0),
  }
}

const OPTION_SEPARATOR = '||~|~||'

export function mapPoll(row: MybbPoll): ImportedPoll | null {
  const labels = row.options.split(OPTION_SEPARATOR)
  const counts = row.votes.split(OPTION_SEPARATOR)
  const createdAt = fromUnixSeconds(row.dateline) ?? new Date(0)

  const options = labels
    .map((label, index) => ({
      order: index + 1,
      label: label.trim(),
      voteCount: Math.max(0, Number(counts[index]) || 0),
    }))
    .filter((option) => option.label !== '')

  if (options.length === 0) return null

  return {
    legacyId: row.pid,
    legacyThreadId: row.tid,
    question: row.question,
    options,
    closesAt:
      row.timeout > 0 ? new Date(createdAt.getTime() + row.timeout * 24 * 60 * 60 * 1000) : null,
    createdAt,
    maxOptions: row.multiple > 0 ? 0 : 1,
    allowRevote: false,
    publicVotes: row.public > 0,
  }
}

export function mapPollVote(row: MybbPollVote): ImportedPollVote | null {
  if (row.voteoption <= 0) return null
  return {
    legacyPollId: row.pid,
    legacyUserId: row.uid,
    optionOrder: row.voteoption,
    votedAt: fromUnixSeconds(row.dateline),
  }
}

const PM_FOLDERS: Readonly<Record<number, 'inbox' | 'sent' | 'trash'>> = {
  1: 'inbox',
  2: 'sent',
  4: 'trash',
}

export function mapPrivateMessage(row: MybbPrivateMessage): ImportedPrivateMessage | null {
  if (row.folder === 3) return null

  return {
    legacyId: row.pmid,
    legacyAuthorId: row.fromid,
    subject: row.subject,
    body: row.message,
    sentAt: fromUnixSeconds(row.dateline) ?? new Date(0),
    copies: [
      {
        legacyOwnerId: row.uid,
        folder: PM_FOLDERS[row.folder] ?? 'inbox',
        readAt: row.status === 0 ? null : fromUnixSeconds(row.readtime),
      },
    ],
  }
}

export function mapThreadSubscription(row: MybbThreadSubscription): ImportedSubscription {
  return {
    legacyId: row.sid,
    legacyUserId: row.uid,
    legacyTargetId: row.tid,
    mode: row.notification === 0 ? 'none' : 'instant',
  }
}

export function mapForumSubscription(row: MybbForumSubscription): ImportedSubscription {
  return {
    legacyId: row.uid,
    legacyUserId: row.uid,
    legacyTargetId: row.fid,
    mode: 'instant',
  }
}

export function mapReputation(row: MybbReputation): ImportedReputation {
  return {
    legacyId: row.rid,
    legacyUserId: row.uid,
    legacyGivenByUserId: row.adduid,
    legacyPostId: row.pid === 0 ? null : row.pid,
    points: row.reputation,
    comment: row.comments,
    createdAt: fromUnixSeconds(row.dateline) ?? new Date(0),
  }
}

export function mapWarning(row: MybbWarning): ImportedWarning {
  return {
    legacyId: row.wid,
    legacyUserId: row.uid,
    legacyIssuedByUserId: row.issuedby,
    legacyPostId: row.pid === 0 ? null : row.pid,
    title: row.title,
    points: Math.max(0, row.points),
    notes: row.notes,
    issuedAt: fromUnixSeconds(row.dateline) ?? new Date(0),
    expiresAt: fromUnixSeconds(row.expires),
    revokedAt: fromUnixSeconds(row.daterevoked),
    revokeReason: row.revokereason.trim() === '' ? null : row.revokereason,
  }
}

export function mapBan(row: MybbBan): ImportedBan {
  return {
    legacyId: row.uid,
    legacyUserId: row.uid,
    legacyBannedByUserId: row.admin,
    reason: row.reason,
    publicReason: null,
    createdAt: fromUnixSeconds(row.dateline) ?? new Date(0),
    expiresAt: fromUnixSeconds(row.lifted),
  }
}

function idList(list: string): number[] {
  return [
    ...new Set(
      list
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ]
}

export function mapRelationList(row: MybbRelationList): ImportedUserRelation[] {
  const buddies = idList(row.buddylist)
  const ignoredSet = new Set(idList(row.ignorelist))
  const buddySet = new Set(buddies)

  return [
    ...buddies.map((other) => ({
      legacyUserId: row.uid,
      legacyOtherUserId: other,
      kind: 'buddy' as const,
    })),
    ...[...ignoredSet]
      .filter((other) => !buddySet.has(other))
      .map((other) => ({
        legacyUserId: row.uid,
        legacyOtherUserId: other,
        kind: 'ignore' as const,
      })),
  ].filter((relation) => relation.legacyOtherUserId !== row.uid)
}
