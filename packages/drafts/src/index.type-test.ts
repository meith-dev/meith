import type { Draft, DraftRepository } from './index'

const draft = {
  forumId: 1,
  threadId: null,
  title: 'Subject',
  message: 'Body',
  prefixId: null,
  updatedAt: new Date(),
} satisfies Draft

const repository = {
  find: async (_userId: number, _forumId: number, _threadId: number | null) => draft,
  save: async (_userId: number, _draft: Draft) => undefined,
  remove: async (_userId: number, _forumId: number, _threadId: number | null) => undefined,
} satisfies DraftRepository

void repository
