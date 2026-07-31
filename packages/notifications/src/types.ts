/**
 * F55 — what a notification is, and the ports the service needs.
 *
 * One decision runs through every type here: **a notification stores captured
 * facts, not a pointer to live rows.**
 *
 * The alternative — store `kind` plus a post id and read the post back when the
 * centre renders — fails in exactly the cases notifications exist for. The post
 * that caused the notification is frequently the post a moderator has since
 * deleted; the warning that caused one may have been revoked. Reading live rows
 * makes yesterday's notification either disappear or, worse, quietly change
 * what it says. The record has to survive its subject.
 *
 * So `data` is a small JSON object captured at raise time (a username, a
 * thread title, a points total), and the *wording* is applied late, by
 * `render.ts`, from the kind. That keeps the two properties that matter: the
 * facts cannot drift, and the sentence around them can still be reworded — or
 * one day translated — without a migration.
 */
import type { NotificationKind } from './kinds'

/** The captured facts. JSON-shaped so it round-trips a `jsonb` column. */
export type NotificationData = Readonly<Record<string, string | number | boolean | null>>

/** A row as it comes back from storage. */
export interface NotificationRecord {
  readonly id: number
  readonly userId: number
  /**
   * Deliberately `string`, not `NotificationKind`. Storage can hold a kind this
   * build has never heard of — a downgrade, or a row written before a kind was
   * removed — and typing it as the union would be a lie the renderer then has
   * to defend against anyway.
   */
  readonly kind: string
  readonly data: NotificationData
  /** Where the notification points. Always a board-relative path. */
  readonly href: string | null
  /**
   * How many times this notification has been raised while it stayed unread.
   *
   * A task that fails every minute raises the same notification 1,440 times a
   * day. Coalescing on the dedupe key turns that into one row with a count —
   * see the migration for the partial unique index that enforces it.
   */
  readonly occurrences: number
  readonly createdAt: Date
  /** When it was last raised. Equals `createdAt` until something coalesces. */
  readonly updatedAt: Date
  readonly readAt: Date | null
}

export interface NotificationPage {
  readonly rows: readonly NotificationRecord[]
  /** Opaque; `undefined` when this is the last page. */
  readonly nextCursor?: string
}

/** What the mail job needs to send one message. */
export interface DeliverableNotification {
  readonly notification: NotificationRecord
  readonly recipient: {
    readonly userId: number
    readonly username: string
    readonly email: string
  }
  /**
   * The recipient's *current* answer for this kind, resolved by the repository.
   *
   * Read again at delivery rather than trusted from raise time: the queue holds
   * a job for as long as it holds it, and somebody who switched e-mail off in
   * between has said no more recently than the raise said yes.
   */
  readonly emailEnabled: boolean
  /** Set once a message has gone out. Suppresses an ordinary queue retry. */
  readonly emailSentAt: Date | null
}

export interface RaiseInput {
  readonly userId: number
  readonly kind: NotificationKind
  readonly data: NotificationData
  readonly href?: string | null
  /**
   * The coalescing identity. Two raises with the same key, while the first is
   * still unread, are one notification with `occurrences` bumped.
   *
   * `null` means "never coalesce" — every warning is its own record even when
   * two arrive in a minute, because they are two different things that
   * happened.
   */
  readonly dedupeKey?: string | null
  /** Whether a mail job should be emitted. Resolved from preferences. */
  readonly email: boolean
  readonly at: Date
}

export interface RaiseResult {
  readonly notificationId: number
  /** True when this raise merged into an existing unread row. */
  readonly coalesced: boolean
  /**
   * Whether a mail job was written to the outbox.
   *
   * False when e-mail is off for this kind **and** false when the raise
   * coalesced: a task failing every minute must not send an e-mail every
   * minute, and the surviving row already carries the count.
   */
  readonly emailQueued: boolean
}

export interface NotificationRepository {
  /**
   * Write the notification and, when `email` is set, the outbox row that will
   * become a mail job — **in one transaction**.
   *
   * The two are atomic with each other and deliberately *not* with whatever
   * caused them. See `service.ts` for why a notification is a consequence of an
   * act rather than part of it.
   */
  raise(input: RaiseInput): Promise<RaiseResult>

  listFor(
    userId: number,
    options: { readonly limit: number; readonly after?: string },
  ): Promise<NotificationPage>

  unreadCount(userId: number): Promise<number>

  /** Returns false when the id is not this user's, or was already read. */
  markRead(userId: number, notificationId: number): Promise<boolean>

  /** Returns how many rows this marked. */
  markAllRead(userId: number): Promise<number>

  /** Stored overrides only. An absent kind takes the registry default. */
  emailPreferencesFor(userId: number): Promise<ReadonlyMap<string, boolean>>

  saveEmailPreferences(
    userId: number,
    entries: ReadonlyMap<string, boolean>,
  ): Promise<void>

  /** Null when the notification, or its recipient, no longer exists. */
  findForDelivery(notificationId: number): Promise<DeliverableNotification | null>

  /** Records that a message went out. Called after a successful send. */
  markEmailSent(notificationId: number, at: Date): Promise<void>

  /**
   * Active accounts holding administrative access, for `staff` kinds.
   *
   * Bounded by `limit`, which is the honest shape: a notification aimed at
   * "the administrators" is a fan-out, and a fan-out with no ceiling is one
   * board configuration away from writing ten thousand rows per failing tick.
   */
  administratorIds(limit: number): Promise<readonly number[]>
}
