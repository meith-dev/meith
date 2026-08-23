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

export type ImportedAvatarSource = 'upload' | 'gallery' | 'remote'

export interface ImportedAvatar {
  readonly legacyUserId: number
  readonly source: ImportedAvatarSource
  readonly path: string
  readonly width: number | null
  readonly height: number | null
}

export interface ImportedAttachment {
  readonly legacyId: number
  readonly legacyPostId: number
  readonly legacyUserId: number
  readonly filename: string
  readonly contentType: string | null
  readonly sizeBytes: number
  readonly path: string
  readonly thumbnailPath: string | null
  readonly downloadCount: number
  readonly createdAt: Date
}

export interface ImportedPollOption {
  readonly order: number
  readonly label: string
  readonly voteCount: number
}

export interface ImportedPoll {
  readonly legacyId: number
  readonly legacyThreadId: number
  readonly question: string
  readonly options: readonly ImportedPollOption[]
  readonly closesAt: Date | null
  readonly createdAt: Date
}

export interface ImportedPollVote {
  readonly legacyPollId: number
  readonly legacyUserId: number
  readonly optionOrder: number
  readonly votedAt: Date | null
}

export type ImportedMessageFolder = 'inbox' | 'sent' | 'trash'

export interface ImportedPrivateMessageCopy {
  readonly legacyOwnerId: number
  readonly folder: ImportedMessageFolder
  readonly readAt: Date | null
}

export interface ImportedPrivateMessage {
  readonly legacyId: number
  readonly legacyAuthorId: number
  readonly subject: string
  readonly body: string
  readonly sentAt: Date
  readonly copies: readonly ImportedPrivateMessageCopy[]
}

export type ImportedSubscriptionMode = 'instant' | 'none'

export interface ImportedSubscription {
  readonly legacyId: number
  readonly legacyUserId: number
  readonly legacyTargetId: number
  readonly mode: ImportedSubscriptionMode
}

export interface ImportedReputation {
  readonly legacyId: number
  readonly legacyUserId: number
  readonly legacyGivenByUserId: number
  readonly legacyPostId: number | null
  readonly points: number
  readonly comment: string
  readonly createdAt: Date
}

export interface ImportedWarning {
  readonly legacyId: number
  readonly legacyUserId: number
  readonly legacyIssuedByUserId: number
  readonly legacyPostId: number | null
  readonly title: string
  readonly points: number
  readonly notes: string
  readonly issuedAt: Date
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly revokeReason: string | null
}

export interface ImportedBan {
  readonly legacyId: number
  readonly legacyUserId: number
  readonly legacyBannedByUserId: number
  readonly reason: string
  readonly publicReason: string | null
  readonly createdAt: Date
  readonly expiresAt: Date | null
}

export type ImportedRelationKind = 'buddy' | 'ignore'

export interface ImportedUserRelation {
  readonly legacyUserId: number
  readonly legacyOtherUserId: number
  readonly kind: ImportedRelationKind
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
