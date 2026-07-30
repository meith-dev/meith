import type { PostPage } from './types'

/** SQL-free seam for the thread-view post read (F31). */
export interface PostRepository {
  listThread(
    threadId: number,
    options: { readonly afterId?: number; readonly limit: number },
  ): Promise<PostPage>
}
