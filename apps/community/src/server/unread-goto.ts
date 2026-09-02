import 'server-only'

import type { ContentScope } from '@meith/core'
import type { PostLocation, PostRepository } from '@meith/posts'
import type { ReadStateRepository } from '@meith/threads'

export interface UnreadGotoThread {
  readonly id: number
  readonly forumId: number
  readonly lastPostId: number | null
}

export async function resolveUnreadGoto(
  posts: PostRepository,
  readState: ReadStateRepository,
  userId: number,
  thread: UnreadGotoThread,
  options: { readonly scope: ContentScope; readonly pageSize: number },
): Promise<PostLocation | null> {
  const marker = await readState.markerFor(userId, thread.id, thread.forumId)
  const located = await posts.locateFirstUnread(
    thread.id,
    { postId: marker.lastReadPostId ?? 0, since: marker.forumReadAt },
    options,
  )
  if (located !== null) return located
  return thread.lastPostId === null ? null : posts.locate(thread.id, thread.lastPostId, options)
}
