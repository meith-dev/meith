import type { ThreadCursor, ThreadPage } from "./types";

/** SQL-free seam for the forum-display read (F30). */
export interface ThreadRepository {
  listForum(
    forumId: number,
    options: { readonly after?: ThreadCursor; readonly limit: number },
  ): Promise<ThreadPage>;
}
