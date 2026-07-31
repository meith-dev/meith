/** F56's pure subscription view models. */
import type { TimeModel } from '@forum/theme-kit'
import type { SubscriptionMode, SubscriptionRow } from '@forum/subscriptions'
import { MODE_LABELS, SUBSCRIPTION_MODES } from '@forum/subscriptions'

import { formatTime } from './time'

export interface SubscriptionRowView {
  readonly key: string
  readonly target: 'thread' | 'forum'
  readonly targetId: number
  readonly title: string
  readonly href: string
  readonly mode: SubscriptionMode
  readonly modeLabel: string
  readonly since: TimeModel
  /** "3 new posts", or null when there is nothing outstanding. */
  readonly pending: string | null
}

export interface SubscriptionsView {
  readonly threads: readonly SubscriptionRowView[]
  readonly forums: readonly SubscriptionRowView[]
  readonly modes: readonly { readonly value: SubscriptionMode; readonly label: string }[]
  readonly total: number
}

export function buildSubscriptionsView(input: {
  readonly rows: readonly SubscriptionRow[]
  readonly now: Date
}): SubscriptionsView {
  const rows = input.rows.map((row) => toRow(row, input.now))

  return {
    /*
     * Split rather than interleaved. Following a forum and following a thread
     * are different commitments — one is "tell me about a room", the other
     * "tell me about a conversation" — and a member pruning their list is
     * almost always after one kind or the other.
     */
    threads: rows.filter((row) => row.target === 'thread'),
    forums: rows.filter((row) => row.target === 'forum'),
    modes: SUBSCRIPTION_MODES.map((value) => ({ value, label: MODE_LABELS[value] })),
    total: rows.length,
  }
}

function toRow(row: SubscriptionRow, now: Date): SubscriptionRowView {
  return {
    key: `${row.target}:${row.targetId}`,
    target: row.target,
    targetId: row.targetId,
    title: row.title,
    href: row.href,
    mode: row.mode,
    modeLabel: MODE_LABELS[row.mode],
    since: formatTime(row.createdAt, now),
    pending:
      row.pending === 0
        ? null
        : `${row.pending} new ${row.pending === 1 ? 'post' : 'posts'}`,
  }
}

/** The notice after following, changing or stopping something. */
export function subscriptionNotice(query: {
  readonly followed?: string | undefined
  readonly stopped?: string | undefined
}): string | null {
  if (query.followed !== undefined) return 'Saved. You are following this.'
  if (query.stopped !== undefined) return 'You will not be notified about that any more.'
  return null
}

/** The unsubscribe page's outcome, from the query string it redirects with. */
export function unsubscribeNotice(done: string | undefined): string | null {
  if (done === 'email') {
    return 'Done — subscription e-mails are off. Your subscriptions are unchanged, and you will still see them in your notifications.'
  }
  if (done === 'one') return 'Done — you will not be notified about that any more.'
  return null
}
