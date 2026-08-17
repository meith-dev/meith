import type { Translator } from '@meith/i18n'
import type { DiscoveryViewModel } from '@meith/theme-kit'

import { count } from './count'
import { formatTime, untranslated } from './time'

export const DISCOVERY_LABELS = {
  new: { labelKey: 'discovery.new.label', blurbKey: 'discovery.new.blurb' },
  today: { labelKey: 'discovery.today.label', blurbKey: 'discovery.today.blurb' },
  mine: { labelKey: 'discovery.mine.label', blurbKey: 'discovery.mine.blurb' },
  participated: {
    labelKey: 'discovery.participated.label',
    blurbKey: 'discovery.participated.blurb',
  },
  unanswered: { labelKey: 'discovery.unanswered.label', blurbKey: 'discovery.unanswered.blurb' },
} as const satisfies Readonly<Record<string, { labelKey: string; blurbKey: string }>>

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
  const t = input.t ?? untranslated()

  return {
    title: t.t(DISCOVERY_LABELS[input.view].labelKey),
    blurb: t.t(DISCOVERY_LABELS[input.view].blurbKey),
    tabsLabel: t.t('discovery.tabsLabel'),
    tabs: input.views.map((view) => ({
      href: `/discover/${view}`,
      label: t.t(DISCOVERY_LABELS[view].labelKey),
      isCurrent: view === input.view,
    })),
    rows: input.rows.map((row) => ({
      threadId: row.threadId,
      title: row.title,
      href: `/thread/${row.threadId}-${row.slug}`,
      forum: { label: row.forumTitle, href: `/${row.forumId}-${row.forumSlug}` },
      authorUsername: row.authorUsername,
      replyCount: count(row.replyCount, input.t),
      lastPostAt: formatTime(row.lastPostAt, input.now, input.t),
      lastPostUsername: row.lastPostUsername,
    })),
    nextHref: input.nextHref,
    nextLabel: t.t('discovery.next', { count: input.pageSize }),
    emptyMessage: t.t(input.isFirstPage ? 'discovery.emptyFirst' : 'discovery.emptyMore'),
    refusal:
      refusal === null
        ? null
        : { message: refusal, signInHref: '/login', signInLabel: t.t('nav.signIn') },
  }
}
