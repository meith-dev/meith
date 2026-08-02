/** F48's pure queue view model. No container, no request, no clock. */
import type { QueueItem } from '@forum/moderation'

import { formatTime } from './time'
import type { TimeModel } from '@forum/theme-kit'

export interface QueueRowModel {
  /** The checkbox value: `kind:id`, parsed back by `parseSelection`. */
  readonly value: string
  readonly kind: 'thread' | 'post'
  /** "New thread" / "Reply", so a moderator knows what they are approving. */
  readonly kindLabel: string
  readonly forumTitle: string
  readonly threadTitle: string
  /**
   * Where to read the item in full.
   *
   * A held *thread* has no page a moderator can open — it is not visible, and
   * F47's scope is what decides that, not this model. So the link goes to the
   * forum, and the excerpt is what the decision is made on. A held *reply*
   * lives in a visible thread and can be linked to directly.
   */
  readonly href: string
  readonly authorUsername: string
  readonly authorHref: string | null
  readonly excerpt: string
  readonly postedAt: TimeModel
}

export interface QueueViewModel {
  readonly rows: readonly QueueRowModel[]
  readonly pending: number
  readonly nextHref: string | null
  /** Set when this actor moderates nothing at all. */
  readonly emptyReason: 'nothing-moderated' | 'queue-empty' | null
}

export interface QueueViewInput {
  readonly items: readonly QueueItem[]
  readonly pending: number
  readonly nextCursor?: string | undefined
  readonly moderatesAnything: boolean
  readonly now: Date
  /**
   * The viewer's timezone (F57). Defaults to UTC — the zone every timestamp on
   * this board used before members could choose one.
   */
  readonly timeZone?: string
}

function row(item: QueueItem, now: Date, timeZone: string | undefined): QueueRowModel {
  const thread = `/thread/${item.threadId}-${item.threadSlug}`
  return {
    value: `${item.kind}:${item.id}`,
    kind: item.kind,
    kindLabel: item.kind === 'thread' ? 'New thread' : 'Reply',
    forumTitle: item.forumTitle,
    threadTitle: item.threadTitle,
    href: item.kind === 'thread' ? `/forum/${item.forumId}` : `${thread}#post-${item.id}`,
    authorUsername: item.authorUsername,
    authorHref: item.authorUserId === null ? null : `/member/${item.authorUserId}`,
    /*
     * The raw body, never rendered. A queue item is unapproved content and the
     * one screen that shows it is the one deciding whether it should exist —
     * running it through the renderer there would give a spammer's markup its
     * first audience, in a moderator's browser.
     */
    excerpt: item.excerpt,
    postedAt: formatTime(item.createdAt, now, timeZone),
  }
}

export function buildQueueView(input: QueueViewInput): QueueViewModel {
  return {
    rows: input.items.map((item) => row(item, input.now, input.timeZone)),
    pending: input.pending,
    nextHref:
      input.nextCursor === undefined
        ? null
        : `/moderation?after=${encodeURIComponent(input.nextCursor)}`,
    emptyReason: !input.moderatesAnything
      ? 'nothing-moderated'
      : input.items.length === 0
        ? 'queue-empty'
        : null,
  }
}
