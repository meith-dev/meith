import type {
  PhpbbAttachment,
  PhpbbAvatarRow,
  PhpbbBan,
  PhpbbForum,
  PhpbbPollOption,
  PhpbbPollTopic,
  PhpbbPollVote,
  PhpbbPost,
  PhpbbPrivateMessage,
  PhpbbPrivateMessageCopy,
  PhpbbTopic,
  PhpbbUser,
  PhpbbWarning,
  PhpbbWatch,
  PhpbbZebra,
} from './phpbb-rows'
import { decodeHtmlEntities, decodePhpbbText } from './phpbb-text'
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
  Visibility,
} from './types'
import { fromUnixSeconds } from './types'

const BOT_USER_TYPE = 2

export function mapPhpbbUser(row: PhpbbUser): ImportedUser | null {
  if (row.user_type === BOT_USER_TYPE) return null

  return {
    legacyId: row.user_id,
    username: decodeHtmlEntities(row.username),
    email: row.user_email.trim().toLowerCase(),
    legacyPasswordHash: `phpbb$${row.user_password}`,
    registeredAt: fromUnixSeconds(row.user_regdate) ?? new Date(0),
    lastVisitAt: fromUnixSeconds(row.user_lastvisit),
    postCount: Math.max(0, row.user_posts),
    legacyGroupId: row.group_id,
  }
}

const FORUM_TYPES: Readonly<Record<number, ImportedForum['type']>> = {
  0: 'category',
  1: 'forum',
  2: 'link',
}

export function mapPhpbbForum(row: PhpbbForum): ImportedForum {
  const description = decodeHtmlEntities(row.forum_desc).trim()

  return {
    legacyId: row.forum_id,
    type: FORUM_TYPES[row.forum_type] ?? 'forum',
    title: decodeHtmlEntities(row.forum_name),
    description: description === '' ? null : description,
    legacyParentId: row.parent_id === 0 ? null : row.parent_id,
    displayOrder: row.left_id,
    linkUrl: row.forum_type === 2 && row.forum_link.trim() !== '' ? row.forum_link : null,
  }
}

export function phpbbVisibility(visibility: number): Visibility {
  if (visibility === 1) return 'visible'
  if (visibility === 2) return 'deleted'
  return 'unapproved'
}

export function mapPhpbbTopic(row: PhpbbTopic): ImportedThread | null {
  if (row.topic_moved_id !== 0) return null

  const createdAt = fromUnixSeconds(row.topic_time) ?? new Date(0)

  return {
    legacyId: row.topic_id,
    legacyForumId: row.forum_id,
    title: decodeHtmlEntities(row.topic_title),
    legacyAuthorId: row.topic_poster,
    authorUsername: decodeHtmlEntities(row.topic_first_poster_name),
    createdAt,
    lastPostAt: fromUnixSeconds(row.topic_last_post_time) ?? createdAt,
    replyCount: Math.max(0, row.topic_posts_approved - 1),
    viewCount: Math.max(0, row.topic_views),
    isSticky: row.topic_type > 0,
    isLocked: row.topic_status === 1,
    visibility: phpbbVisibility(row.topic_visibility),
  }
}

export function mapPhpbbPost(row: PhpbbPost): ImportedPost {
  return {
    legacyId: row.post_id,
    legacyThreadId: row.topic_id,
    legacyForumId: row.forum_id,
    legacyAuthorId: row.poster_id,
    authorUsername: decodeHtmlEntities(row.post_username),
    body: decodePhpbbText(row.post_text, row.bbcode_uid),
    createdAt: fromUnixSeconds(row.post_time) ?? new Date(0),
    editedAt: fromUnixSeconds(row.post_edit_time),
    visibility: phpbbVisibility(row.post_visibility),
  }
}

const AVATAR_SOURCES: Readonly<Record<string, ImportedAvatar['source']>> = {
  'avatar.driver.upload': 'upload',
  'avatar.driver.remote': 'remote',
  'avatar.driver.gallery': 'gallery',
  '1': 'upload',
  '2': 'remote',
  '3': 'gallery',
}

export function mapPhpbbAvatar(row: PhpbbAvatarRow): ImportedAvatar | null {
  const source = AVATAR_SOURCES[row.user_avatar_type.trim()]
  if (source === undefined) return null

  const value = row.user_avatar.split('?')[0]?.trim() ?? ''
  if (value === '') return null

  const path =
    source === 'upload'
      ? `images/avatars/upload/*_${row.user_id}${extensionOf(value)}`
      : source === 'gallery'
        ? `images/avatars/gallery/${value}`
        : value

  return {
    legacyUserId: row.user_id,
    source,
    path,
    width: row.user_avatar_width > 0 ? row.user_avatar_width : null,
    height: row.user_avatar_height > 0 ? row.user_avatar_height : null,
  }
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

export function mapPhpbbAttachment(row: PhpbbAttachment): ImportedAttachment {
  const mimetype = row.mimetype.trim()

  return {
    legacyId: row.attach_id,
    legacyPostId: row.post_msg_id,
    legacyUserId: row.poster_id,
    filename: decodeHtmlEntities(row.real_filename),
    contentType: mimetype === '' ? null : mimetype,
    sizeBytes: Math.max(0, row.filesize),
    path: `files/${row.physical_filename}`,
    thumbnailPath: row.thumbnail === 1 ? `files/thumb_${row.physical_filename}` : null,
    downloadCount: Math.max(0, row.download_count),
    createdAt: fromUnixSeconds(row.filetime) ?? new Date(0),
  }
}

export function mapPhpbbPoll(
  topic: PhpbbPollTopic,
  options: readonly PhpbbPollOption[],
): ImportedPoll | null {
  const createdAt = fromUnixSeconds(topic.poll_start) ?? new Date(0)

  const mapped = options
    .filter((option) => option.topic_id === topic.topic_id)
    .sort((a, b) => a.poll_option_id - b.poll_option_id)
    .map((option) => ({
      order: option.poll_option_id,
      label: decodeHtmlEntities(option.poll_option_text).trim(),
      voteCount: Math.max(0, option.poll_option_total),
    }))
    .filter((option) => option.label !== '')

  if (mapped.length === 0) return null

  return {
    legacyId: topic.topic_id,
    legacyThreadId: topic.topic_id,
    question: decodeHtmlEntities(topic.poll_title),
    options: mapped,
    closesAt:
      topic.poll_length > 0 ? new Date((topic.poll_start + topic.poll_length) * 1000) : null,
    createdAt,
  }
}

export function mapPhpbbPollVote(row: PhpbbPollVote): ImportedPollVote {
  return {
    legacyPollId: row.topic_id,
    legacyUserId: row.vote_user_id,
    optionOrder: row.poll_option_id,
    votedAt: null,
  }
}

export function mapPhpbbPrivateMessage(
  message: PhpbbPrivateMessage,
  copies: readonly PhpbbPrivateMessageCopy[],
): ImportedPrivateMessage | null {
  const mapped = copies
    .filter((copy) => copy.msg_id === message.msg_id)
    .map((copy) => ({
      legacyOwnerId: copy.user_id,
      folder:
        copy.pm_deleted === 1
          ? ('trash' as const)
          : copy.user_id === message.author_id && copy.folder_id < 0
            ? ('sent' as const)
            : ('inbox' as const),
      readAt: copy.pm_unread === 1 ? null : (fromUnixSeconds(message.message_time) ?? null),
    }))

  if (mapped.length === 0) return null

  return {
    legacyId: message.msg_id,
    legacyAuthorId: message.author_id,
    subject: decodeHtmlEntities(message.message_subject),
    body: decodePhpbbText(message.message_text, message.bbcode_uid),
    sentAt: fromUnixSeconds(message.message_time) ?? new Date(0),
    copies: mapped,
  }
}

export function mapPhpbbWatch(row: PhpbbWatch): ImportedSubscription {
  return {
    legacyId: row.user_id,
    legacyUserId: row.user_id,
    legacyTargetId: row.target_id,
    mode: 'instant',
  }
}

export function mapPhpbbWarning(row: PhpbbWarning): ImportedWarning {
  return {
    legacyId: row.warning_id,
    legacyUserId: row.user_id,
    legacyIssuedByUserId: 0,
    legacyPostId: row.post_id === 0 ? null : row.post_id,
    title: 'Warning',
    points: 1,
    notes: '',
    issuedAt: fromUnixSeconds(row.warning_time) ?? new Date(0),
    expiresAt: null,
    revokedAt: null,
    revokeReason: null,
  }
}

export function mapPhpbbBan(row: PhpbbBan): ImportedBan | null {
  if (row.ban_userid === 0 || row.ban_exclude === 1) return null

  const publicReason = decodeHtmlEntities(row.ban_give_reason).trim()

  return {
    legacyId: row.ban_id,
    legacyUserId: row.ban_userid,
    legacyBannedByUserId: 0,
    reason: decodeHtmlEntities(row.ban_reason),
    publicReason: publicReason === '' ? null : publicReason,
    createdAt: fromUnixSeconds(row.ban_start) ?? new Date(0),
    expiresAt: fromUnixSeconds(row.ban_end),
  }
}

export function mapPhpbbZebra(row: PhpbbZebra): ImportedUserRelation | null {
  if (row.user_id === row.zebra_id) return null
  if (row.friend === 1) {
    return { legacyUserId: row.user_id, legacyOtherUserId: row.zebra_id, kind: 'buddy' }
  }
  if (row.foe === 1) {
    return { legacyUserId: row.user_id, legacyOtherUserId: row.zebra_id, kind: 'ignore' }
  }
  return null
}

export function noPhpbbReputation(): Promise<{
  rows: readonly ImportedReputation[]
  nextCursor: null
}> {
  return Promise.resolve({ rows: [], nextCursor: null })
}
