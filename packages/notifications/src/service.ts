/**
 * F55 — the notification service.
 *
 * Two rules shape it.
 *
 * ## 1. A notification is a consequence of an act, not part of it
 *
 * Issuing a warning writes the warning. Telling the member is a *second*
 * transaction, deliberately: a warning that failed because the notification
 * table was locked would be a moderator action lost to a side effect, and the
 * warning is the thing that must not be lost. So producers call `raise` after
 * their own work has committed, and a raise that throws is caught by the
 * producer and logged rather than unwinding it.
 *
 * The atomicity that *does* matter is inside the raise: the row and the mail
 * job are written together (see `NotificationRepository.raise`), so the board
 * can never e-mail somebody about a notification their centre does not show.
 *
 * ## 2. E-mail is decided here, delivery happens elsewhere
 *
 * `raise` resolves whether this member wants mail for this kind and records the
 * answer by emitting — or not emitting — the outbox row. Nothing on the request
 * path talks to a mail driver: F05's drivers are called from a queued job so
 * that a provider timing out cannot become a failed moderator action, and the
 * roadmap's "queued mail" is exactly this arrangement rather than a promise
 * about latency.
 */
import { ValidationError } from '@forum/core'

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

/**
 * The most administrators one `system` notification will fan out to.
 *
 * A ceiling rather than a page: this is an operational alert, and the tenth
 * administrator to be told adds nothing the first nine did not already have.
 * Without one, a board that grants administrative access to a large group turns
 * every failing tick into a write per member.
 */
export const MAX_STAFF_FANOUT = 50

/** One row of the preferences screen. */
export interface NotificationPreferenceView {
  readonly kind: string
  readonly title: string
  readonly description: string
  /** The effective answer: the stored override, or the registry default. */
  readonly email: boolean
  /** True when the value shown is the registry's rather than the member's. */
  readonly isDefault: boolean
}

export class NotificationService {
  private readonly repository: NotificationRepository
  private readonly now: () => Date

  constructor(deps: { notifications: NotificationRepository; now?: () => Date }) {
    this.repository = deps.notifications
    this.now = deps.now ?? (() => new Date())
  }

  /**
   * Raise one notification.
   *
   * `kind` is a registry id rather than free text, so a typo is a compile error
   * instead of a row nothing can render.
   */
  async raise(input: {
    readonly userId: number
    readonly kind: NotificationKind
    readonly data: NotificationData
    readonly href?: string | null
    readonly dedupeKey?: string | null
  }): Promise<RaiseResult> {
    const spec = notificationKind(input.kind)
    /* Unreachable through the type, and cheap insurance for a JS caller. */
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

  /**
   * Raise the same notification for every administrator.
   *
   * Each recipient's preference is resolved separately — one administrator
   * having switched failure mail off must not silence it for the rest — and one
   * recipient failing does not abandon the others: an alert that reaches four
   * of five people is worth strictly more than an exception.
   */
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
      } catch {
        /* Deliberately swallowed; see the doc comment. */
      }
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

  /**
   * Mark one notification read.
   *
   * Scoped by user in the *statement* rather than by reading the row first:
   * "not yours" and "does not exist" then give the same answer, which is what
   * stops the endpoint being an oracle for how many notifications the board has
   * written.
   */
  async markRead(userId: number, notificationId: number): Promise<boolean> {
    return this.repository.markRead(userId, notificationId)
  }

  async markAllRead(userId: number): Promise<number> {
    return this.repository.markAllRead(userId)
  }

  /**
   * The preferences screen's rows: the registry, with stored overrides applied.
   *
   * Driven by the registry rather than by what is stored, so a member who has
   * never opened the screen sees every kind at its default — and a kind added
   * in a later deploy appears for everybody at once.
   */
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

  /**
   * Save the preferences screen.
   *
   * `enabled` is the set of *checked* boxes, because that is what a no-JS form
   * submits — an unchecked checkbox sends nothing at all. The unchecked half is
   * therefore reconstructed from the registry rather than from the form, and
   * only for the audience whose screen was rendered: without that scoping, a
   * member submitting the member screen would silently write `false` rows for
   * every staff kind they cannot see.
   */
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

  /** The stored override, or the kind's default. */
  private async wantsEmail(userId: number, kind: string): Promise<boolean> {
    const spec = notificationKind(kind)
    if (spec === undefined) return false

    const stored = await this.repository.emailPreferencesFor(userId)
    return stored.get(kind) ?? spec.emailByDefault
  }
}
