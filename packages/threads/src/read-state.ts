/** F32's per-member watermarks. Guests never have read state. */
export interface ReadState {
  readonly communityReadAt: ReadonlyMap<number, Date>
  readonly threadLastPostId: ReadonlyMap<number, number>
  /** Communities containing at least one visible unread thread. */
  readonly unreadCommunityIds: ReadonlySet<number>
}

export interface ReadStateRepository {
  forUser(userId: number): Promise<ReadState>
  markCommunitiesRead(userId: number, communityIds: readonly number[], at: Date): Promise<void>
  markThreadRead(userId: number, threadId: number, postId: number, at: Date): Promise<void>
}
