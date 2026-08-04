/** F44 — durable drafts, with no browser dependency. */
export interface Draft {
  readonly forumId: number
  readonly threadId: number | null
  readonly title: string
  readonly message: string
  readonly prefixId: number | null
}

export interface DraftRepository {
  find(userId: number, forumId: number, threadId: number | null): Promise<Draft | null>
  save(userId: number, draft: Draft): Promise<void>
  remove(userId: number, forumId: number, threadId: number | null): Promise<void>
}
