export interface ReadState {
  readonly forumReadAt: ReadonlyMap<number, Date>
  readonly threadLastPostId: ReadonlyMap<number, number>
  readonly unreadForumIds: ReadonlySet<number>
}

export interface ThreadReadMarker {
  readonly lastReadPostId: number | null
  readonly forumReadAt: Date | null
}

export interface ReadStateRepository {
  forUser(userId: number): Promise<ReadState>
  markerFor(userId: number, threadId: number, forumId: number): Promise<ThreadReadMarker>
  markForumsRead(userId: number, forumIds: readonly number[], at: Date): Promise<void>
  markThreadRead(userId: number, threadId: number, postId: number, at: Date): Promise<void>
}
