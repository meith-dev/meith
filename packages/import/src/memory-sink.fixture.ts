import type { ImportSink, WriteResult } from './run'

const byLegacyId = (row: { legacyId: number }): string => String(row.legacyId)
const byPair = (row: { legacyUserId: number; legacyTargetId: number }): string =>
  `${row.legacyUserId}:${row.legacyTargetId}`

export class MemorySink implements ImportSink {
  readonly stored = new Map<string, Map<string, unknown>>()
  readonly calls: string[] = []

  putUsers = (rows: readonly { legacyId: number }[]) => this.#put('users', rows, byLegacyId)
  putForums = (rows: readonly { legacyId: number }[]) => this.#put('forums', rows, byLegacyId)
  putThreads = (rows: readonly { legacyId: number }[]) => this.#put('threads', rows, byLegacyId)
  putPosts = (rows: readonly { legacyId: number }[]) => this.#put('posts', rows, byLegacyId)
  putAvatars = (rows: readonly { legacyUserId: number }[]) =>
    this.#put('avatars', rows, (row) => String(row.legacyUserId))
  putAttachments = (rows: readonly { legacyId: number }[]) =>
    this.#put('attachments', rows, byLegacyId)
  putPolls = (rows: readonly { legacyId: number }[]) => this.#put('polls', rows, byLegacyId)
  putPollVotes = (
    rows: readonly { legacyPollId: number; legacyUserId: number; optionOrder: number }[],
  ) =>
    this.#put(
      'pollVotes',
      rows,
      (row) => `${row.legacyPollId}:${row.legacyUserId}:${row.optionOrder}`,
    )
  putPrivateMessages = (rows: readonly { legacyId: number }[]) =>
    this.#put('privateMessages', rows, byLegacyId)
  putThreadSubscriptions = (rows: readonly { legacyUserId: number; legacyTargetId: number }[]) =>
    this.#put('threadSubscriptions', rows, byPair)
  putForumSubscriptions = (rows: readonly { legacyUserId: number; legacyTargetId: number }[]) =>
    this.#put('forumSubscriptions', rows, byPair)
  putReputation = (rows: readonly { legacyId: number }[]) =>
    this.#put('reputation', rows, byLegacyId)
  putWarnings = (rows: readonly { legacyId: number }[]) => this.#put('warnings', rows, byLegacyId)
  putBans = (rows: readonly { legacyId: number }[]) => this.#put('bans', rows, byLegacyId)
  putUserRelations = (rows: readonly { legacyUserId: number; legacyOtherUserId: number }[]) =>
    this.#put('userRelations', rows, (row) => `${row.legacyUserId}:${row.legacyOtherUserId}`)

  count(kind: string): number {
    return this.stored.get(kind)?.size ?? 0
  }

  rows<T>(kind: string): readonly T[] {
    return [...(this.stored.get(kind)?.values() ?? [])] as T[]
  }

  async #put<T>(kind: string, rows: readonly T[], keyOf: (row: T) => string): Promise<WriteResult> {
    this.calls.push(`${kind}:${rows.length}`)
    const table = this.stored.get(kind) ?? new Map<string, unknown>()
    this.stored.set(kind, table)

    let inserted = 0
    let updated = 0
    for (const row of rows) {
      const key = keyOf(row)
      if (table.has(key)) updated += 1
      else inserted += 1
      table.set(key, row)
    }
    return { inserted, updated, skipped: [] }
  }
}
