import type { Translator } from '@meith/i18n'

import { inlineOutcomeNotice } from './inline-moderation'
import { untranslated } from './time'

export interface ForumNoticeQuery {
  readonly posted?: string | undefined
  readonly thread?: string | undefined
  readonly did?: string | undefined
  readonly n?: string | undefined
  readonly refused?: string | undefined
  readonly gone?: string | undefined
  readonly skipped?: string | undefined
}

export function forumNotice(
  query: ForumNoticeQuery,
  t: Translator = untranslated(),
): string | null {
  if (query.posted === 'moderated') return t.t('forum.threadHeld')
  if (query.thread === 'deleted') return t.t('forum.threadDeleted')

  return inlineOutcomeNotice(query)
}
