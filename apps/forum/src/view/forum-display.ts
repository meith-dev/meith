/** F30's pure forum-display view model. */
import type { ForumListingRow } from "@forum/forums";
import type {
  ForumDisplayModel,
  ForumRowModel,
  LastPostModel,
  PaginationModel,
  SubforumListModel,
  ThreadRowModel,
} from "@forum/theme-kit";
import type { ThreadListingRow, ThreadPage } from "@forum/threads";

import { forumHref } from "./board-index";
import { formatTime } from "./time";

function threadHref(row: ThreadListingRow): string {
  return `/thread/${row.id}-${row.slug}`;
}

function lastPost(
  post: {
    readonly postId: number;
    readonly userId: number | null;
    readonly username: string;
    readonly at: Date;
  } | null,
  thread: ThreadListingRow,
  now: Date,
): LastPostModel | null {
  if (!post) return null;
  return {
    threadTitle: thread.title,
    href: `${threadHref(thread)}#post-${post.postId}`,
    author: { userId: post.userId, username: post.username, profileHref: null },
    at: formatTime(post.at, now),
  };
}

function forum(row: ForumListingRow): ForumRowModel {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    href: forumHref(row),
    type: row.type,
    threadCount: row.threadCount,
    postCount: row.postCount,
    lastPost: null,
    isUnread: false,
    subforums: [],
  };
}

function thread(row: ThreadListingRow, now: Date): ThreadRowModel {
  return {
    id: row.id,
    title: row.title,
    href: threadHref(row),
    prefix: row.prefix,
    author: {
      userId: row.authorUserId,
      username: row.authorUsername,
      profileHref: null,
    },
    replyCount: row.replyCount,
    viewCount: row.viewCount,
    isSticky: row.isSticky,
    isLocked: row.isLocked,
    isUnread: false,
    isMoved: row.isMoved,
    lastPost: lastPost(row.lastPost, row, now),
  };
}

export interface ForumDisplayInput {
  readonly forum: ForumListingRow;
  readonly subforums: readonly ForumListingRow[];
  readonly page: ThreadPage;
  readonly pageNumber: number;
  readonly nextHref: string | null;
  readonly now: Date;
}

export interface ForumDisplayView {
  readonly display: Omit<ForumDisplayModel, "regions">;
  readonly subforums: SubforumListModel | null;
  readonly threads: readonly ThreadRowModel[];
  readonly pagination: PaginationModel;
}

export function buildForumDisplayView(
  input: ForumDisplayInput,
): ForumDisplayView {
  return {
    display: {
      forum: forum(input.forum),
      // F39/F32 own these write endpoints. Do not link to routes that do not exist.
      newThreadHref: null,
      markReadAction: null,
    },
    subforums:
      input.subforums.length === 0
        ? null
        : { forums: input.subforums.map(forum) },
    threads: input.page.rows.map((row) => thread(row, input.now)),
    pagination: {
      page: input.pageNumber,
      // Cursor pagination deliberately does not run a count query just to show a total.
      pageCount: input.pageNumber,
      pages: [{ page: input.pageNumber, href: "", isCurrent: true }],
      previousHref: null,
      nextHref: input.nextHref,
    },
  };
}
