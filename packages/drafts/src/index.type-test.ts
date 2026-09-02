import type { Draft, DraftRepository, DraftSummary } from './index'

const draft = {
  forumId: 1,
  threadId: null,
  title: 'Subject',
  message: 'Body',
  prefixId: null,
  updatedAt: new Date(),
} satisfies Draft

const summary = {
  forumId: 1,
  forumTitle: 'General',
  forumSlug: 'general',
  threadId: null,
  threadTitle: null,
  threadSlug: null,
  title: 'Subject',
  message: 'Body',
  updatedAt: new Date(),
} satisfies DraftSummary

const repository = {
  find: async (_userId: number, _forumId: number, _threadId: number | null) => draft,
  save: async (_userId: number, _draft: Draft) => undefined,
  remove: async (_userId: number, _forumId: number, _threadId: number | null) => undefined,
  listByUser: async (_userId: number) => [summary],
} satisfies DraftRepository

void repository
