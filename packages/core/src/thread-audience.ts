export type ThreadAuthorFilter =
  | { readonly kind: 'all' }
  | { readonly kind: 'author'; readonly userId: number }
  | { readonly kind: 'none' }

export const ALL_THREAD_AUTHORS: ThreadAuthorFilter = { kind: 'all' }

export const NO_THREAD_AUTHORS: ThreadAuthorFilter = { kind: 'none' }

export function authorFilterFrom(options: {
  readonly seesOthersThreads: boolean
  readonly viewerUserId: number | null
}): ThreadAuthorFilter {
  if (options.seesOthersThreads) return ALL_THREAD_AUTHORS
  return options.viewerUserId === null
    ? NO_THREAD_AUTHORS
    : { kind: 'author', userId: options.viewerUserId }
}

export function authorFilterAdmits(
  filter: ThreadAuthorFilter,
  authorUserId: number | null,
): boolean {
  switch (filter.kind) {
    case 'all':
      return true
    case 'none':
      return false
    case 'author':
      return authorUserId !== null && authorUserId === filter.userId
  }
}

export interface ThreadAudience {
  readonly forumIds: readonly number[]
  readonly ownThreadsOnlyForumIds: readonly number[]
  readonly viewerUserId: number | null
}

export const NO_THREAD_AUDIENCE: ThreadAudience = {
  forumIds: [],
  ownThreadsOnlyForumIds: [],
  viewerUserId: null,
}

export function unrestrictedAudience(
  forumIds: readonly number[],
  viewerUserId: number | null = null,
): ThreadAudience {
  return { forumIds, ownThreadsOnlyForumIds: [], viewerUserId }
}

export function audienceForumIds(audience: ThreadAudience): {
  readonly open: readonly number[]
  readonly ownThreadsOnly: readonly number[]
} {
  const restricted = new Set(audience.ownThreadsOnlyForumIds)
  return {
    open: audience.forumIds.filter((id) => !restricted.has(id)),
    ownThreadsOnly:
      audience.viewerUserId === null ? [] : audience.forumIds.filter((id) => restricted.has(id)),
  }
}

export function audienceIsEmpty(audience: ThreadAudience): boolean {
  const { open, ownThreadsOnly } = audienceForumIds(audience)
  return open.length === 0 && ownThreadsOnly.length === 0
}

export function audienceFilterIn(audience: ThreadAudience, forumId: number): ThreadAuthorFilter {
  if (!audience.forumIds.includes(forumId)) return NO_THREAD_AUTHORS
  return authorFilterFrom({
    seesOthersThreads: !audience.ownThreadsOnlyForumIds.includes(forumId),
    viewerUserId: audience.viewerUserId,
  })
}
