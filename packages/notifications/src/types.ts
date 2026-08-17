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

export interface DeliverableNotification {
  readonly notification: NotificationRecord
  readonly recipient: {
    readonly userId: number
    readonly username: string
    readonly email: string
  }
  readonly emailEnabled: boolean
  readonly emailSentAt: Date | null
}

export interface RaiseInput {
  readonly userId: number
  readonly kind: string
  readonly data: NotificationData
  readonly href?: string | null
  readonly dedupeKey?: string | null
  readonly email: boolean
  readonly at: Date
}

export interface RaiseResult {
  readonly notificationId: number
  readonly coalesced: boolean
  readonly emailQueued: boolean
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

  /** Every notification this member has, read or not. */
  countFor(userId: number): Promise<number>

  markRead(userId: number, notificationId: number): Promise<boolean>

  markAllRead(userId: number): Promise<number>

  emailPreferencesFor(userId: number): Promise<ReadonlyMap<string, boolean>>

  saveEmailPreferences(userId: number, entries: ReadonlyMap<string, boolean>): Promise<void>

  findForDelivery(notificationId: number): Promise<DeliverableNotification | null>

  markEmailSent(notificationId: number, at: Date): Promise<void>

  administratorIds(limit: number): Promise<readonly number[]>
}
