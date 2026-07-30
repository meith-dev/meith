import type { ThreadCursor, ThreadListingRow, ThreadPage } from "./types";

/** SQL-free seam for the forum-display read (F30). */
export interface ThreadRepository {
  /** A visible thread by its stable id, or no thread. */
  findVisibleById(id: number): Promise<ThreadListingRow | null>;

  listForum(
    forumId: number,
    options: { readonly after?: ThreadCursor; readonly limit: number },
  ): Promise<ThreadPage>;
}
