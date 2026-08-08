/**
 * F48 — the approval queue.
 *
 * The mechanism was already built: approving is `unapproved → visible`, which
 * is F41's transition, counter-correct and idempotent against replay. What this
 * adds is the part F41 could not: a *list* of what is waiting, scoped by
 * moderator rights rather than by view permission, and a bulk decision over it
 * that stays bounded.
 *
 * Two rules shape everything here.
 *
 *  1. **The selection is never trusted.** A form submits ids. Each one is
 *     re-read to find out which community it is actually in, and only then checked
 *     against the communities this actor moderates. An id in the POST body is a
 *     request, not a fact.
 *  2. **A refusal is reported, not silently dropped.** A moderator who selects
 *     twelve items and acts on eleven must be told, or the queue quietly
 *     disagrees with itself about what happened.
 */
import { ValidationError } from '@meith/core'

export type QueueItemKind = 'thread' | 'post'

/** What the form submits: a kind and an id, and nothing else. */
export interface QueueSelection {
  readonly kind: QueueItemKind
  readonly id: number
}

/** One row of the queue, as the screen needs it. */
export interface QueueItem extends QueueSelection {
  readonly communityId: number
  readonly communityTitle: string
  readonly threadId: number
  readonly threadSlug: string
  readonly threadTitle: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  /** The raw body, already truncated by the repository. Never rendered as HTML. */
  readonly excerpt: string
  readonly createdAt: Date
}

export interface QueuePage {
  readonly items: readonly QueueItem[]
  /** Opaque; `undefined` when this is the last page. */
  readonly nextCursor?: string
}

/** A selected item after its community has been re-read from the database. */
export interface PendingItem extends QueueSelection {
  readonly communityId: number
}

export type QueueDecision = 'approve' | 'reject'

export interface QueueOutcome {
  readonly decision: QueueDecision
  /** Items whose state actually changed. */
  readonly applied: number
  /** Selected, but in a community this actor does not moderate. */
  readonly refused: number
  /** Selected, but no longer pending — somebody else got there first. */
  readonly missing: number
}

export interface ModerationQueueRepository {
  /** Oldest first: a queue is worked from the front. */
  list(
    communityIds: readonly number[],
    options: { readonly limit: number; readonly after?: string },
  ): Promise<QueuePage>

  /** How many items are waiting, for the screen's heading. */
  countPending(communityIds: readonly number[]): Promise<number>

  /**
   * Re-read the selection. Returns only items that are *still pending*, with
   * the community they are really in — which is the whole point of the call.
   */
  resolve(selection: readonly QueueSelection[]): Promise<readonly PendingItem[]>

  /**
   * Apply one decision to items already checked by the caller.
   *
   * Threads and posts are separate arguments because they are separate
   * transitions: approving a thread also approves the opening post it was held
   * with, and nothing else in the thread.
   */
  apply(input: {
    readonly decision: QueueDecision
    readonly threadIds: readonly number[]
    readonly postIds: readonly number[]
    readonly actorUserId: number
    readonly at: Date
  }): Promise<number>
}

/**
 * The most items one request may decide.
 *
 * The screen offers a page of 25, so this is not a limit anybody meets by
 * clicking — it is the ceiling on a hand-crafted POST. Every item costs a
 * transaction with counter updates and a last-post repair up the tree, so an
 * unbounded selection is a request that runs until the platform kills it,
 * halfway through a bulk approval, with no record of where it stopped.
 */
export const MAX_CHUNK = 200

export const QUEUE_PAGE_SIZE = 25

export class ModerationQueue {
  private readonly queue: ModerationQueueRepository
  private readonly now: () => Date

  constructor(deps: { queue: ModerationQueueRepository; now?: () => Date }) {
    this.queue = deps.queue
    this.now = deps.now ?? (() => new Date())
  }

  /** One page of what is waiting in the communities this actor moderates. */
  async list(
    moderatedCommunityIds: readonly number[],
    options: { readonly after?: string } = {},
  ): Promise<QueuePage> {
    if (moderatedCommunityIds.length === 0) return { items: [] }
    return this.queue.list(moderatedCommunityIds, {
      limit: QUEUE_PAGE_SIZE,
      ...(options.after === undefined ? {} : { after: options.after }),
    })
  }

  async countPending(moderatedCommunityIds: readonly number[]): Promise<number> {
    if (moderatedCommunityIds.length === 0) return 0
    return this.queue.countPending(moderatedCommunityIds)
  }

  /**
   * Apply a decision to a selection.
   *
   * `moderatedCommunityIds` is the caller's already-resolved answer to "which
   * communities may this actor act in" — the same set the listing used. Passing it
   * rather than an actor keeps group and matrix reasoning inside
   * `@meith/authorization` (R4), and means this command cannot accidentally
   * widen its own authority.
   */
  async decide(input: {
    readonly selection: readonly QueueSelection[]
    readonly decision: QueueDecision
    readonly moderatedCommunityIds: ReadonlySet<number>
    readonly actorUserId: number
  }): Promise<QueueOutcome> {
    if (input.selection.length === 0) {
      throw new ValidationError('Select at least one item.')
    }
    if (input.selection.length > MAX_CHUNK) {
      throw new ValidationError(
        `At most ${MAX_CHUNK} items can be handled at once. Work through the queue a page at a time.`,
      )
    }

    /*
     * Duplicates in the submitted list would be counted twice in the outcome
     * even though the second application changes nothing, so the selection is
     * deduplicated before anything else looks at it.
     */
    const unique = new Map<string, QueueSelection>()
    for (const item of input.selection) unique.set(`${item.kind}:${item.id}`, item)

    const pending = await this.queue.resolve([...unique.values()])
    const missing = unique.size - pending.length

    const allowed = pending.filter((item) => input.moderatedCommunityIds.has(item.communityId))
    const refused = pending.length - allowed.length

    const applied =
      allowed.length === 0
        ? 0
        : await this.queue.apply({
            decision: input.decision,
            threadIds: allowed.filter((i) => i.kind === 'thread').map((i) => i.id),
            postIds: allowed.filter((i) => i.kind === 'post').map((i) => i.id),
            actorUserId: input.actorUserId,
            at: this.now(),
          })

    return { decision: input.decision, applied, refused, missing }
  }
}

/**
 * Turn form fields into a selection.
 *
 * Native checkboxes submit repeated `item` values shaped `kind:id`; anything
 * that is not exactly that is dropped rather than guessed at. A malformed entry
 * is a tampered or truncated POST, and the honest response to one is to act on
 * the parts that are unambiguous and report the rest as missing.
 */
export function parseSelection(values: readonly string[]): QueueSelection[] {
  const out: QueueSelection[] = []
  for (const value of values) {
    const match = /^(thread|post):([1-9]\d*)$/.exec(value)
    if (!match) continue
    const id = Number(match[2])
    if (!Number.isSafeInteger(id)) continue
    out.push({ kind: match[1] as QueueItemKind, id })
  }
  return out
}
