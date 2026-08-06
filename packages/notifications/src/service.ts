import { ValidationError } from '@meith/core'

import {
  configurableKindsFor,
  notificationKind,
  type NotificationAudience,
  type NotificationKind,
} from './kinds'
import { renderNotification, type NotificationView } from './render'
import type {
  NotificationData,
  NotificationRepository,
  RaiseResult,
} from './types'

export const NOTIFICATIONS_PAGE_SIZE = 25

export const MAX_STAFF_FANOUT = 50

export interface NotificationPreferenceView {
  readonly kind: string
  readonly title: string
  readonly description: string
  readonly email: boolean
  readonly isDefault: boolean
}

export class NotificationService {
  private readonly repository: NotificationRepository
  private readonly now: () => Date

  constructor(deps: { notifications: NotificationRepository; now?: () => Date }) {
    this.repository = deps.notifications
    this.now = deps.now ?? (() => new Date())
  }

  async raise(input: {
    readonly userId: number
    readonly kind: NotificationKind
    readonly data: NotificationData
    readonly href?: string | null
    readonly dedupeKey?: string | null
  }): Promise<RaiseResult> {
    const spec = notificationKind(input.kind)
    if (spec === undefined) throw new ValidationError(`Unknown notification kind: ${input.kind}`)

    const email = await this.wantsEmail(input.userId, input.kind)

    return this.repository.raise({
      userId: input.userId,
      kind: input.kind,
      data: input.data,
      href: input.href ?? null,
      dedupeKey: input.dedupeKey ?? null,
      email,
      at: this.now(),
    })
  }

  async raiseForAdministrators(input: {
    readonly kind: NotificationKind
    readonly data: NotificationData
    readonly href?: string | null
    readonly dedupeKey?: string | null
  }): Promise<{ raised: number }> {
    const recipients = await this.repository.administratorIds(MAX_STAFF_FANOUT)

    let raised = 0
    for (const userId of recipients) {
      try {
        await this.raise({ ...input, userId })
        raised += 1
      } catch {}
    }
    return { raised }
  }

  async list(
    userId: number,
    options: { readonly after?: string } = {},
  ): Promise<{ rows: readonly NotificationView[]; nextCursor?: string }> {
    const page = await this.repository.listFor(userId, {
      limit: NOTIFICATIONS_PAGE_SIZE,
      ...(options.after === undefined ? {} : { after: options.after }),
    })

    return {
      rows: page.rows.map(renderNotification),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    }
  }

  async unreadCount(userId: number): Promise<number> {
    return this.repository.unreadCount(userId)
  }

  async markRead(userId: number, notificationId: number): Promise<boolean> {
    return this.repository.markRead(userId, notificationId)
  }

  async markAllRead(userId: number): Promise<number> {
    return this.repository.markAllRead(userId)
  }

  async preferences(
    userId: number,
    audience: NotificationAudience,
  ): Promise<readonly NotificationPreferenceView[]> {
    const stored = await this.repository.emailPreferencesFor(userId)

    return configurableKindsFor(audience).map((spec) => {
      const override = stored.get(spec.id)
      return {
        kind: spec.id,
        title: spec.title,
        description: spec.description,
        email: override ?? spec.emailByDefault,
        isDefault: override === undefined,
      }
    })
  }

  async savePreferences(
    userId: number,
    audience: NotificationAudience,
    enabled: readonly string[],
  ): Promise<void> {
    const checked = new Set(enabled)
    const entries = new Map<string, boolean>()

    for (const spec of configurableKindsFor(audience)) {
      entries.set(spec.id, checked.has(spec.id))
    }

    await this.repository.saveEmailPreferences(userId, entries)
  }

  private async wantsEmail(userId: number, kind: string): Promise<boolean> {
    const spec = notificationKind(kind)
    if (spec === undefined) return false

    const stored = await this.repository.emailPreferencesFor(userId)
    return stored.get(kind) ?? spec.emailByDefault
  }
}
