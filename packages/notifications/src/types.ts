export type NotificationValue =
  | string
  | number
  | boolean
  | null
  | readonly NotificationValue[]
  | { readonly [key: string]: NotificationValue }

export type NotificationData = Readonly<Record<string, NotificationValue>>

export interface NotificationRecord {
  readonly id: number
  readonly userId: number
  readonly kind: string
  readonly data: NotificationData
  readonly href: string | null
  readonly occurrences: number
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly readAt: Date | null
}

export interface NotificationPage {
  readonly rows: readonly NotificationRecord[]
  readonly nextCursor?: string
}

export type NotificationChannel = 'email' | 'push'

export interface NotificationChannelPreference {
  readonly email: boolean | null
  readonly push: boolean | null
}

export interface PushSubscriptionRecord {
  readonly id: number
  readonly userId: number
  readonly endpoint: string
  readonly p256dh: string
  readonly auth: string
  readonly createdAt: Date
  readonly lastSeenAt: Date
}

export interface SavePushSubscriptionInput {
  readonly userId: number
  readonly endpoint: string
  readonly p256dh: string
  readonly auth: string
  readonly at: Date
}

export interface DeliverableNotification {
  readonly notification: NotificationRecord
  readonly recipient: {
    readonly userId: number
    readonly username: string
    readonly email: string
    readonly locale: string
  }
  readonly emailEnabled: boolean
  readonly emailSentAt: Date | null
  readonly pushEnabled: boolean
  readonly pushSentAt: Date | null
}

export interface RaiseInput {
  readonly userId: number
  readonly kind: string
  readonly data: NotificationData
  readonly href?: string | null
  readonly dedupeKey?: string | null
  readonly email: boolean
  readonly push: boolean
  readonly at: Date
}

export interface RaiseResult {
  readonly notificationId: number
  readonly coalesced: boolean
  readonly emailQueued: boolean
  readonly pushQueued: boolean
}

export interface NotificationRepository {
  raise(input: RaiseInput): Promise<RaiseResult>

  listFor(
    userId: number,
    options: {
      readonly limit: number
      readonly after?: string
      readonly offset?: number
    },
  ): Promise<NotificationPage>

  unreadCount(userId: number): Promise<number>

  countFor(userId: number): Promise<number>

  markRead(userId: number, notificationId: number): Promise<boolean>

  markAllRead(userId: number): Promise<number>

  preferencesFor(userId: number): Promise<ReadonlyMap<string, NotificationChannelPreference>>

  savePreferences(
    userId: number,
    channel: NotificationChannel,
    entries: ReadonlyMap<string, boolean>,
  ): Promise<void>

  findForDelivery(notificationId: number): Promise<DeliverableNotification | null>

  markEmailSent(notificationId: number, at: Date): Promise<void>

  markPushSent(notificationId: number, at: Date): Promise<void>

  savePushSubscription(input: SavePushSubscriptionInput): Promise<void>

  removePushSubscription(userId: number, endpoint: string): Promise<boolean>

  pushSubscriptionsFor(userId: number): Promise<readonly PushSubscriptionRecord[]>

  countPushSubscriptions(userId: number): Promise<number>

  prunePushSubscription(id: number): Promise<void>

  touchPushSubscription(id: number, at: Date): Promise<void>

  administratorIds(limit: number): Promise<readonly number[]>
}
