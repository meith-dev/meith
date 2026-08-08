/**
 * F07 — domain event contracts.
 *
 * Events are the seam between "a thing happened" and "everything that must
 * follow from it". A reply being posted has to bump counters, touch the parent
 * community's last-post pointer, fan out subscription notifications, and reindex for
 * search. Doing that inline makes the request slow and couples posting to the
 * mail driver being up.
 *
 * The rule (R5): domain code emits an event *inside the same transaction* that
 * wrote the data, into the `outbox` table. A relay drains the outbox into the
 * queue afterwards. This is the transactional-outbox pattern, and it is the only
 * arrangement that survives the two failure modes a naive
 * `await queue.enqueue()` cannot:
 *
 *   1. Transaction commits, enqueue fails  -> work silently lost.
 *   2. Enqueue succeeds, transaction rolls back -> handler runs against data
 *      that does not exist.
 *
 * Because the outbox write is part of the transaction, it is atomically
 * consistent with the data change. Because the relay is a separate step, a
 * handler can never observe uncommitted state.
 */

/** Every event payload is a plain JSON object so it can round-trip the outbox. */
export interface DomainEventMap {
  'user.registered': { userId: number; email: string; requiresActivation: boolean }
  'user.activated': { userId: number }
  /*
   * There is deliberately no `user.password_reset_requested`.
   *
   * It was declared here from the start with no emitter and no handler, on the
   * assumption that a reset mail would be queued like every other message. F19
   * sends it directly instead (see `auth-mail.ts`): the queued path adds up to a
   * full tick interval to a flow where people retry within seconds, and it would
   * mean a live reset token sitting in the outbox as readable JSON — a bearer
   * credential in a table an operator can select from, for as long as the tick
   * takes to drain it.
   */
  'user.group_changed': { userId: number; addedGroupIds: number[]; removedGroupIds: number[] }

  'thread.created': { threadId: number; communityId: number; authorId: number | null }
  'thread.moved': { threadId: number; fromCommunityId: number; toCommunityId: number }
  'thread.deleted': { threadId: number; communityId: number }
  'thread.visibility_changed': { threadId: number; communityId: number; visible: boolean }

  'post.created': { postId: number; threadId: number; communityId: number; authorId: number | null }
  'post.edited': { postId: number; threadId: number }
  'post.deleted': { postId: number; threadId: number; communityId: number }
  'post.visibility_changed': { postId: number; threadId: number; communityId: number; visible: boolean }

  /**
   * F55. Raised inside the same transaction as the notification row, and only
   * when e-mail is wanted for it — so this event means "send this one", not
   * "somebody was notified". A notification whose recipient has e-mail switched
   * off writes no row here at all, which is what keeps the outbox proportional
   * to the mail the board actually sends rather than to everything it records.
   */
  'notification.created': { notificationId: number; userId: number; kind: string }

  /**
   * F42. Raised once an attachment row exists, and carrying nothing but its id:
   * the handler re-reads the row, because at-least-once delivery means it may
   * run after the post was deleted or the row already processed.
   */
  'attachment.uploaded': { attachmentId: number }

  /** F58. Same shape and same reason as `attachment.uploaded`. */
  'avatar.uploaded': { userId: number }

  'community.structure_changed': { communityIds: number[] }
  'settings.changed': { keys: string[] }
  'theme.changed': { themeId: number }

  /*
   * F67's mass mail. One event per recipient, carrying the campaign id rather
   * than the body: the body lives on `mass_mails` and would otherwise be copied
   * into the queue once per member on the board.
   */
  'admin.mass_mail_queued': { massMailId: number; userId: number; email: string }
}

export type DomainEventName = keyof DomainEventMap

export type DomainEvent<N extends DomainEventName = DomainEventName> = {
  [K in N]: {
    name: K
    payload: DomainEventMap[K]
    /**
     * Caller-supplied stable key. Two emits with the same key are the same
     * logical event; the outbox drops the duplicate. Lets a retried request
     * avoid double-notifying.
     */
    dedupeKey?: string
  }
}[N]

/** A row as it sits in the outbox, before the relay has moved it. */
export interface OutboxRecord {
  id: number
  name: DomainEventName
  payload: unknown
  dedupeKey: string | null
  createdAt: Date
  relayedAt: Date | null
}

/**
 * Handlers are registered per event name. Several handlers may respond to one
 * event; each becomes its own queue job so a failing notification handler
 * cannot prevent search indexing from running.
 */
export interface EventHandler<N extends DomainEventName = DomainEventName> {
  /** Stable across deploys — it is part of the job's idempotency key. */
  readonly id: string
  readonly event: N
  handle(payload: DomainEventMap[N]): Promise<void>
}
