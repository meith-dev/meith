import type {
  ImportedAttachment,
  ImportedAvatar,
  ImportedBan,
  ImportedForum,
  ImportedPoll,
  ImportedPollVote,
  ImportedPost,
  ImportedPrivateMessage,
  ImportedReputation,
  ImportedSubscription,
  ImportedThread,
  ImportedUser,
  ImportedUserRelation,
  ImportedWarning,
} from './types'

export interface Page<T> {
  readonly rows: readonly T[]
  readonly nextCursor: number | null
}

export type ImportSourceName = 'mybb' | 'phpbb'

export interface ImportSource {
  readonly name: ImportSourceName
  users(afterId: number, limit: number): Promise<Page<ImportedUser>>
  forums(afterId: number, limit: number): Promise<Page<ImportedForum>>
  threads(afterId: number, limit: number): Promise<Page<ImportedThread>>
  posts(afterId: number, limit: number): Promise<Page<ImportedPost>>
  avatars(afterId: number, limit: number): Promise<Page<ImportedAvatar>>
  attachments(afterId: number, limit: number): Promise<Page<ImportedAttachment>>
  polls(afterId: number, limit: number): Promise<Page<ImportedPoll>>
  pollVotes(afterId: number, limit: number): Promise<Page<ImportedPollVote>>
  privateMessages(afterId: number, limit: number): Promise<Page<ImportedPrivateMessage>>
  threadSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>>
  forumSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>>
  reputation(afterId: number, limit: number): Promise<Page<ImportedReputation>>
  warnings(afterId: number, limit: number): Promise<Page<ImportedWarning>>
  bans(afterId: number, limit: number): Promise<Page<ImportedBan>>
  userRelations(afterId: number, limit: number): Promise<Page<ImportedUserRelation>>
}

export function pageById<T>(
  all: readonly T[],
  idOf: (row: T) => number,
  afterId: number,
  limit: number,
): Page<T> {
  const rows = [...all]
    .sort((a, b) => idOf(a) - idOf(b))
    .filter((row) => idOf(row) > afterId)
    .slice(0, limit)

  const last = rows.at(-1)
  return { rows, nextCursor: rows.length < limit || last === undefined ? null : idOf(last) }
}

export async function pageByGroup<T>(input: {
  readonly afterGroup: number
  readonly limit: number
  readonly groupOf: (row: T) => number
  readonly fetch: (afterGroup: number, limit: number) => Promise<readonly T[]>
  readonly fetchGroup: (group: number) => Promise<readonly T[]>
}): Promise<Page<T>> {
  const rows = await input.fetch(input.afterGroup, input.limit)
  const last = rows.at(-1)
  if (rows.length < input.limit || last === undefined) return { rows, nextCursor: null }

  const lastGroup = input.groupOf(last)
  const kept = rows.filter((row) => input.groupOf(row) !== lastGroup)

  if (kept.length === 0) {
    const whole = await input.fetchGroup(lastGroup)
    return { rows: whole, nextCursor: lastGroup }
  }

  const lastKept = kept.at(-1)
  return {
    rows: kept,
    nextCursor: lastKept === undefined ? null : input.groupOf(lastKept),
  }
}

export function groupRows<T>(
  all: readonly T[],
  groupOf: (row: T) => number,
): {
  fetch: (afterGroup: number, limit: number) => Promise<readonly T[]>
  fetchGroup: (group: number) => Promise<readonly T[]>
} {
  const sorted = [...all].sort((a, b) => groupOf(a) - groupOf(b))
  return {
    fetch: (afterGroup, limit) =>
      Promise.resolve(sorted.filter((row) => groupOf(row) > afterGroup).slice(0, limit)),
    fetchGroup: (group) => Promise.resolve(sorted.filter((row) => groupOf(row) === group)),
  }
}
