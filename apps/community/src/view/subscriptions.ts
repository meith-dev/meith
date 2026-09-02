import type { Translator } from '@meith/i18n'
import type { CompiledWordFilter } from '@meith/markdown'
import type { SubscriptionMode, SubscriptionRow } from '@meith/subscriptions'
import { MODE_LABELS, SUBSCRIPTION_MODES } from '@meith/subscriptions'
import type { TimeModel } from '@meith/theme-kit'

import { formatTime, untranslated } from './time'
import { filterWords } from './word-filter'

export interface SubscriptionRowView {
  readonly key: string
  readonly target: 'thread' | 'forum'
  readonly targetId: number
  readonly title: string
  readonly href: string
  readonly mode: SubscriptionMode
  readonly modeLabel: string
  readonly since: TimeModel
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
  readonly t?: Translator
  readonly wordFilter?: CompiledWordFilter | undefined
}): SubscriptionsView {
  const rows = input.rows.map((row) => toRow(row, input.now, input.t, input.wordFilter))

  return {
    threads: rows.filter((row) => row.target === 'thread'),
    forums: rows.filter((row) => row.target === 'forum'),
    modes: SUBSCRIPTION_MODES.map((value) => ({ value, label: MODE_LABELS[value] })),
    total: rows.length,
  }
}

function toRow(
  row: SubscriptionRow,
  now: Date,
  t: Translator | undefined,
  wordFilter: CompiledWordFilter | undefined,
): SubscriptionRowView {
  return {
    key: `${row.target}:${row.targetId}`,
    target: row.target,
    targetId: row.targetId,
    title: row.target === 'thread' ? filterWords(row.title, wordFilter) : row.title,
    href: row.href,
    mode: row.mode,
    modeLabel: MODE_LABELS[row.mode],
    since: formatTime(row.createdAt, now, t),
    pending:
      row.pending === 0 ? null : `${row.pending} new ${row.pending === 1 ? 'post' : 'posts'}`,
  }
}

export function subscriptionNotice(
  query: {
    readonly followed?: string | undefined
    readonly stopped?: string | undefined
  },
  t: Translator = untranslated(),
): string | null {
  if (query.followed !== undefined) return t.t('subscription.followed')
  if (query.stopped !== undefined) return t.t('subscription.stopped')
  return null
}

export function unsubscribeNotice(
  done: string | undefined,
  t: Translator = untranslated(),
): string | null {
  if (done === 'announcements') return t.t('subscription.announcementsOff')
  if (done === 'email') return t.t('subscription.emailsOff')
  if (done === 'boardDigest') return t.t('subscription.boardDigestOff')
  if (done === 'one') return t.t('subscription.doneOne')
  return null
}
