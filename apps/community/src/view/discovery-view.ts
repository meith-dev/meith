import type { Translator } from '@meith/i18n'
import type { DiscoveryViewModel } from '@meith/theme-kit'

import { formatTime } from './time'

export const DISCOVERY_LABELS = {
  new: {
    label: 'New posts',
    blurb: 'Threads with a reply in the last day.',
  },
  today: {
    label: "Today's posts",
    blurb: 'Threads with a reply since midnight, in your timezone.',
  },
  mine: {
    label: 'My threads',
    blurb: 'Threads you started.',
  },
  participated: {
    label: 'My posts',
    blurb: 'Threads you have posted in.',
  },
  unanswered: {
    label: 'Unanswered',
    blurb: 'Threads nobody has replied to yet — a good place to help.',
  },
} as const satisfies Readonly<Record<string, { label: string; blurb: string }>>

export type DiscoveryKey = keyof typeof DISCOVERY_LABELS

export interface DiscoveryThreadRow {
  readonly threadId: number
  readonly slug: string
  readonly title: string
  readonly forumId: number
  readonly forumSlug: string
  readonly forumTitle: string
  readonly authorUsername: string
  readonly replyCount: number
  readonly lastPostAt: Date
  readonly lastPostUsername: string | null
}

export function buildDiscoveryView(input: {
  readonly view: DiscoveryKey
  readonly views: readonly DiscoveryKey[]
  readonly rows: readonly DiscoveryThreadRow[]
  readonly nextHref: string | null
  readonly pageSize: number
  readonly isFirstPage: boolean
  readonly refusalMessage?: string | null | undefined
  readonly now: Date
  readonly t?: Translator | undefined
}): DiscoveryViewModel {
  const refusal = input.refusalMessage ?? null

  return {
    title: DISCOVERY_LABELS[input.view].label,
    blurb: DISCOVERY_LABELS[input.view].blurb,
    tabsLabel: 'Discovery views',
    tabs: input.views.map((view) => ({
      href: `/discover/${view}`,
      label: DISCOVERY_LABELS[view].label,
      isCurrent: view === input.view,
    })),
    rows: input.rows.map((row) => ({
      threadId: row.threadId,
      title: row.title,
      href: `/thread/${row.threadId}-${row.slug}`,
      forum: { label: row.forumTitle, href: `/${row.forumId}-${row.forumSlug}` },
      authorUsername: row.authorUsername,
      replyCount: row.replyCount,
      lastPostAt: formatTime(row.lastPostAt, input.now, input.t),
      lastPostUsername: row.lastPostUsername,
    })),
    nextHref: input.nextHref,
    nextLabel: `Next ${input.pageSize} threads`,
    emptyMessage: input.isFirstPage
      ? 'Nothing here right now. Check back later, or start a conversation of your own.'
      : 'Nothing here right now. You have reached the end of this list.',
    refusal:
      refusal === null ? null : { message: refusal, signInHref: '/login', signInLabel: 'Sign in' },
  }
}
