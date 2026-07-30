/** F32's per-member watermarks. Guests never have read state. */
export interface ReadState {
  readonly forumReadAt: ReadonlyMap<number, Date>
  readonly threadLastPostId: ReadonlyMap<number, number>
  /** Forums containing at least one visible unread thread. */
  readonly unreadForumIds: ReadonlySet<number>
}

export interface ReadStateRepository {
  forUser(userId: number): Promise<ReadState>
  markForumsRead(userId: number, forumIds: readonly number[], at: Date): Promise<void>
  markThreadRead(userId: number, threadId: number, postId: number, at: Date): Promise<void>
}
