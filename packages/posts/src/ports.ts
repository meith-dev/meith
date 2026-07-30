import type { PostPage } from './types'

/** SQL-free seam for the thread-view post read (F31). */
export interface PostRepository {
  /** An exact visible post, used to validate a mark-read target (F32). */
  findVisibleById(threadId: number, postId: number): Promise<number | null>

  listThread(
    threadId: number,
    options: { readonly afterId?: number; readonly limit: number },
  ): Promise<PostPage>
}
