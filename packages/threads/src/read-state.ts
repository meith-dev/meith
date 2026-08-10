export interface ReadState {
  readonly forumReadAt: ReadonlyMap<number, Date>
  readonly threadLastPostId: ReadonlyMap<number, number>
  readonly unreadForumIds: ReadonlySet<number>
}

export interface ReadStateRepository {
  forUser(userId: number): Promise<ReadState>
  markForumsRead(userId: number, forumIds: readonly number[], at: Date): Promise<void>
  markThreadRead(userId: number, threadId: number, postId: number, at: Date): Promise<void>
}
