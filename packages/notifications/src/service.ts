import { ValidationError } from '@meith/core'
import { EN_CATALOG, sourceTranslator, type Translator } from '@meith/i18n'

import {
  NOTIFICATION_KINDS,
  type NotificationAudience,
  type RegisteredNotificationKind,
} from './kinds'
import { type NotificationView, renderNotification } from './render'
import type {
  NotificationChannel,
  NotificationData,
  NotificationRepository,
  PushSubscriptionRecord,
  RaiseResult,
  SavePushSubscriptionInput,
} from './types'

export const NOTIFICATIONS_PAGE_SIZE = 25

export const MAX_STAFF_FANOUT = 50

export interface NotificationPreferenceView {
  readonly kind: string
  readonly title: string
  readonly description: string
  readonly titleKey?: string
  readonly descriptionKey?: string
  readonly email: boolean
  readonly push: boolean
  readonly isDefault: boolean
}

export interface NotificationAudit {
  readonly before: (input: {
    readonly userId: number
    readonly kind: string
    readonly subjectText: string
    readonly href: string
  }) => Promise<{
    readonly userId: number
    readonly kind: string
    readonly subjectText: string
    readonly href: string
  } | null>
  readonly created: (input: {
    readonly notificationId: number
    readonly userId: number
  }) => Promise<void>
}

export const NO_NOTIFICATION_AUDIT: NotificationAudit = {
  before: async (input) => input,
  created: async () => {},
}

const DROPPED: RaiseResult = {
  notificationId: 0,
  coalesced: true,
  emailQueued: false,
  pushQueued: false,
}

function subjectTextOf(data: NotificationData): string {
  const subject = data.subject ?? data.subjectKey ?? ''
  return typeof subject === 'string' ? subject : String(subject)
}

export class NotificationService {
  private readonly repository: NotificationRepository
  private readonly now: () => Date
  private readonly kinds: ReadonlyMap<string, RegisteredNotificationKind>
  private readonly audit: NotificationAudit

  constructor(deps: {
    notifications: NotificationRepository
    now?: () => Date
    extraKinds?: readonly RegisteredNotificationKind[]
    audit?: NotificationAudit
  }) {
    this.repository = deps.notifications
    this.now = deps.now ?? (() => new Date())
    this.audit = deps.audit ?? NO_NOTIFICATION_AUDIT

    const kinds = new Map<string, RegisteredNotificationKind>(
      NOTIFICATION_KINDS.map((kind) => [kind.id, kind as RegisteredNotificationKind]),
    )
    for (const extra of deps.extraKinds ?? []) {
      if (!extra.id.startsWith('plugin.')) {
        throw new ValidationError(
          `Registered notification kind "${extra.id}" must be namespaced plugin.…`,
        )
      }
      if (kinds.has(extra.id)) {
        throw new ValidationError(`Notification kind "${extra.id}" is declared twice.`)
      }
      kinds.set(extra.id, extra)
    }
    this.kinds = kinds
  }

  async raise(input: {
    readonly userId: number
    readonly kind: string
    readonly data: NotificationData
    readonly href?: string | null
    readonly dedupeKey?: string | null
  }): Promise<RaiseResult> {
    const spec = this.kinds.get(input.kind)
    if (spec === undefined) throw new ValidationError(`Unknown notification kind: ${input.kind}`)

    const proposed = await this.audit.before({
      userId: input.userId,
      kind: input.kind,
      subjectText: subjectTextOf(input.data),
      href: input.href ?? '',
    })
    if (proposed === null) return DROPPED

    const wanted = await this.wanted(proposed.userId, proposed.kind)

    const result = await this.repository.raise({
      userId: proposed.userId,
      kind: proposed.kind,
      data: input.data,
      href: proposed.href === '' ? null : proposed.href,
      dedupeKey: input.dedupeKey ?? null,
      email: wanted.email,
      push: wanted.push,
      at: this.now(),
    })

    if (!result.coalesced) {
      await this.audit.created({ notificationId: result.notificationId, userId: proposed.userId })
    }
    return result
  }

  async raiseForAdministrators(input: {
    readonly kind: string
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
    options: { readonly after?: string; readonly offset?: number } = {},
    t: Translator = sourceTranslator(EN_CATALOG),
  ): Promise<{ rows: readonly NotificationView[]; nextCursor?: string }> {
    const page = await this.repository.listFor(userId, {
      limit: NOTIFICATIONS_PAGE_SIZE,
      ...(options.after === undefined ? {} : { after: options.after }),
      ...(options.offset === undefined ? {} : { offset: options.offset }),
    })

    return {
      rows: page.rows.map((row) => renderNotification(row, t)),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    }
  }

  async count(userId: number): Promise<number> {
    return this.repository.countFor(userId)
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

  configurableKinds(
    audience: NotificationAudience,
    channel: NotificationChannel = 'email',
  ): readonly RegisteredNotificationKind[] {
    return [...this.kinds.values()].filter(
      (kind) =>
        kind.audience === audience &&
        (channel === 'email' ? kind.emailConfigurable : kind.pushConfigurable),
    )
  }

  async preferences(
    userId: number,
    audience: NotificationAudience,
  ): Promise<readonly NotificationPreferenceView[]> {
    const stored = await this.repository.preferencesFor(userId)

    return this.configurableKinds(audience).map((spec) => {
      const override = stored.get(spec.id)
      return {
        kind: spec.id,
        title: spec.title,
        description: spec.description,
        ...(spec.titleKey === undefined ? {} : { titleKey: spec.titleKey }),
        ...(spec.descriptionKey === undefined ? {} : { descriptionKey: spec.descriptionKey }),
        email: override?.email ?? spec.emailByDefault,
        push: spec.pushConfigurable ? (override?.push ?? spec.pushByDefault) : false,
        isDefault: override === undefined,
      }
    })
  }

  async savePreferences(
    userId: number,
    audience: NotificationAudience,
    enabled: readonly string[],
    channel: NotificationChannel = 'email',
  ): Promise<void> {
    const checked = new Set(enabled)
    const entries = new Map<string, boolean>()

    for (const spec of this.configurableKinds(audience, channel)) {
      entries.set(spec.id, checked.has(spec.id))
    }

    await this.repository.savePreferences(userId, channel, entries)
  }

  async pushSubscriptions(userId: number): Promise<readonly PushSubscriptionRecord[]> {
    return this.repository.pushSubscriptionsFor(userId)
  }

  async countPushSubscriptions(userId: number): Promise<number> {
    return this.repository.countPushSubscriptions(userId)
  }

  async subscribeToPush(input: Omit<SavePushSubscriptionInput, 'at'>): Promise<void> {
    await this.repository.savePushSubscription({ ...input, at: this.now() })
  }

  async unsubscribeFromPush(userId: number, endpoint: string): Promise<boolean> {
    return this.repository.removePushSubscription(userId, endpoint)
  }

  async unsubscribeAllFromPush(userId: number): Promise<number> {
    return this.repository.removeAllPushSubscriptions(userId)
  }

  private async wanted(userId: number, kind: string): Promise<{ email: boolean; push: boolean }> {
    const spec = this.kinds.get(kind)
    if (spec === undefined) return { email: false, push: false }

    const stored = (await this.repository.preferencesFor(userId)).get(kind)
    const asked = spec.pushConfigurable ? (stored?.push ?? spec.pushByDefault) : spec.pushByDefault

    return {
      email: stored?.email ?? spec.emailByDefault,
      push: asked && (await this.repository.countPushSubscriptions(userId)) > 0,
    }
  }
}
