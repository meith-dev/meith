import type { Translator } from '@meith/i18n'
import type { QueueItem } from '@meith/moderation'
import type { TimeModel } from '@meith/theme-kit'

import { postLink } from './post-link'
import { formatTime, untranslated } from './time'

export interface QueueRowModel {
  readonly value: string
  readonly kind: 'thread' | 'post'
  readonly kindLabel: string
  readonly forumTitle: string
  readonly threadTitle: string
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
  readonly emptyReason: 'nothing-moderated' | 'queue-empty' | null
}

export interface QueueViewInput {
  readonly items: readonly QueueItem[]
  readonly pending: number
  readonly nextCursor?: string | undefined
  readonly moderatesAnything: boolean
  readonly now: Date
  readonly t?: Translator
}

function row(item: QueueItem, now: Date, t: Translator | undefined): QueueRowModel {
  const thread = `/thread/${item.threadId}-${item.threadSlug}`
  return {
    value: `${item.kind}:${item.id}`,
    kind: item.kind,
    kindLabel: (t ?? untranslated()).t(item.kind === 'thread' ? 'queue.newThread' : 'queue.reply'),
    forumTitle: item.forumTitle,
    threadTitle: item.threadTitle,
    href: item.kind === 'thread' ? `/${item.forumId}` : postLink(thread, item.id),
    authorUsername: item.authorUsername,
    authorHref: item.authorUserId === null ? null : `/member/${item.authorUserId}`,
    excerpt: item.excerpt,
    postedAt: formatTime(item.createdAt, now, t),
  }
}

export function buildQueueView(input: QueueViewInput): QueueViewModel {
  return {
    rows: input.items.map((item) => row(item, input.now, input.t)),
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
