import { inlineOutcomeNotice } from './inline-moderation'

export interface ForumNoticeQuery {
  readonly posted?: string | undefined
  readonly thread?: string | undefined
  readonly did?: string | undefined
  readonly n?: string | undefined
  readonly refused?: string | undefined
  readonly gone?: string | undefined
  readonly skipped?: string | undefined
}

export function forumNotice(query: ForumNoticeQuery): string | null {
  if (query.posted === 'moderated') {
    return 'Your thread was posted and is waiting for a moderator to approve it.'
  }

  if (query.thread === 'deleted') {
    return 'The thread was deleted. It is removed rather than destroyed, so a moderator can restore it.'
  }

  return inlineOutcomeNotice(query)
}
