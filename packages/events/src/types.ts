export interface DomainEventMap {
  'user.registered': { userId: number; email: string; requiresActivation: boolean }
  'user.activated': { userId: number }
  'user.group_changed': { userId: number; addedGroupIds: number[]; removedGroupIds: number[] }

  'thread.created': { threadId: number; forumId: number; authorId: number | null }
  'thread.moved': { threadId: number; fromForumId: number; toForumId: number }
  'thread.deleted': { threadId: number; forumId: number }
  'thread.visibility_changed': { threadId: number; forumId: number; visible: boolean }
  'thread.lock_changed': { threadId: number; forumId: number; locked: boolean }

  'post.created': { postId: number; threadId: number; forumId: number; authorId: number | null }
  'post.edited': { postId: number; threadId: number }
  'post.deleted': { postId: number; threadId: number; forumId: number }
  'post.visibility_changed': { postId: number; threadId: number; forumId: number; visible: boolean }

  'notification.created': { notificationId: number; userId: number; kind: string }

  'attachment.uploaded': { attachmentId: number }

  'avatar.uploaded': { userId: number }

  'forum.structure_changed': { forumIds: number[] }
  'settings.changed': { keys: string[] }
  'theme.changed': { themeId: number }

  'admin.mass_mail_queued': { massMailId: number; userId: number; email: string }
}

export type DomainEventName = keyof DomainEventMap

export type DomainEvent<N extends DomainEventName = DomainEventName> = {
  [K in N]: {
    name: K
    payload: DomainEventMap[K]
    dedupeKey?: string
  }
}[N]

export interface OutboxRecord {
  id: number
  name: DomainEventName
  payload: unknown
  dedupeKey: string | null
  createdAt: Date
  relayedAt: Date | null
}

export interface EventHandler<N extends DomainEventName = DomainEventName> {
  readonly id: string
  readonly event: N
  handle(payload: DomainEventMap[N]): Promise<void>
}
