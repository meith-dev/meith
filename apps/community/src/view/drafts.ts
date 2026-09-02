import type { DraftSummary } from '@meith/drafts'
import type { Translator } from '@meith/i18n'
import type { TimeModel } from '@meith/theme-kit'

import { copyFor } from './copy'
import { formatTime, untranslated } from './time'

export function draftsPageCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(['draftsPage.delete'], t)
}

export interface DraftRowView {
  readonly key: string
  readonly kind: 'thread' | 'reply'
  readonly kindLabel: string
  readonly targetName: string
  readonly resumeHref: string
  readonly forumId: number
  readonly threadId: number | null
  readonly updatedAt: TimeModel
}

export function buildDraftsView(input: {
  readonly drafts: readonly DraftSummary[]
  readonly now: Date
  readonly t?: Translator
}): readonly DraftRowView[] {
  const t = input.t ?? untranslated()

  return input.drafts.map((draft) => {
    const isReply = draft.threadId !== null
    return {
      key: isReply ? `thread:${draft.threadId}` : `forum:${draft.forumId}`,
      kind: isReply ? 'reply' : 'thread',
      kindLabel: t.t(isReply ? 'draftsPage.kind.reply' : 'draftsPage.kind.thread'),
      targetName: isReply ? (draft.threadTitle ?? draft.forumTitle) : draft.forumTitle,
      resumeHref: isReply
        ? `/thread/${draft.threadId}-${draft.threadSlug}/reply`
        : `/${draft.forumId}-${draft.forumSlug}/new`,
      forumId: draft.forumId,
      threadId: draft.threadId,
      updatedAt: formatTime(draft.updatedAt, input.now, t),
    }
  })
}
