import type { BoardDigestCadence } from './modes'

export interface BoardDigestThread {
  readonly threadId: number
  readonly title: string
  readonly href: string
  readonly forumTitle: string
  readonly replyCount: number
  readonly lastAuthor: string | null
}

export interface EligibleMember {
  readonly userId: number
  readonly lastActiveAt: Date
}

export interface BoardDigestRepository {
  dueMembers(input: {
    readonly cadence: BoardDigestCadence
    readonly dueBefore: Date
    readonly lapsedBefore: Date
    readonly limit: number
  }): Promise<readonly EligibleMember[]>

  recordDigestRun(input: { readonly userId: number; readonly at: Date }): Promise<void>
}

export interface BoardDigestContentSource {
  threadsActiveSince(
    userId: number,
    since: Date,
    limit: number,
  ): Promise<readonly BoardDigestThread[]>
}

export interface BoardDigestNotifierPort {
  raise(input: {
    readonly userId: number
    readonly kind: 'board.digest'
    readonly data: Record<string, unknown>
    readonly href: string | null
    readonly dedupeKey: string | null
  }): Promise<void>
}
