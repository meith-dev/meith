export interface Draft {
  readonly forumId: number
  readonly threadId: number | null
  readonly title: string
  readonly message: string
  readonly prefixId: number | null
  readonly updatedAt?: Date
}

export interface DraftSummary {
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly threadId: number | null
  readonly threadTitle: string | null
  readonly threadSlug: string | null
  readonly title: string
  readonly message: string
  readonly updatedAt: Date
}

export interface DraftRepository {
  find(userId: number, forumId: number, threadId: number | null): Promise<Draft | null>
  save(userId: number, draft: Draft): Promise<void>
  remove(userId: number, forumId: number, threadId: number | null): Promise<void>
  listByUser(userId: number): Promise<readonly DraftSummary[]>
}
