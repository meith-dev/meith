/**
 * F07 — domain event contracts.
 *
 * Events are the seam between "a thing happened" and "everything that must
 * follow from it". A reply being posted has to bump counters, touch the parent
 * forum's last-post pointer, fan out subscription notifications, and reindex for
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
  'user.password_reset_requested': { userId: number; email: string; token: string }
  'user.group_changed': { userId: number; addedGroupIds: number[]; removedGroupIds: number[] }

  'thread.created': { threadId: number; forumId: number; authorId: number | null }
  'thread.moved': { threadId: number; fromForumId: number; toForumId: number }
  'thread.deleted': { threadId: number; forumId: number }
  'thread.visibility_changed': { threadId: number; forumId: number; visible: boolean }

  'post.created': { postId: number; threadId: number; forumId: number; authorId: number | null }
  'post.edited': { postId: number; threadId: number }
  'post.deleted': { postId: number; threadId: number; forumId: number }
  'post.visibility_changed': { postId: number; threadId: number; forumId: number; visible: boolean }

  'forum.structure_changed': { forumIds: number[] }
  'settings.changed': { keys: string[] }
  'theme.changed': { themeId: number }
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
