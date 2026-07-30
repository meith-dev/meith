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
import type { ReadState, ThreadListingRow, ThreadPage } from "@forum/threads";

import { forumHref } from "./board-index";
import { memberHref } from "./member-profile";
import { formatTime } from "./time";

export function threadHref(row: ThreadListingRow): string {
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
    author: { userId: post.userId, username: post.username, profileHref: post.userId === null ? null : memberHref(post.userId) },
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

export function threadRowModel(
  row: ThreadListingRow,
  now: Date,
  readState: Pick<ReadState, "forumReadAt" | "threadLastPostId"> | null = null,
): ThreadRowModel {
  const last = row.lastPost;
  const isUnread =
    last !== null &&
    readState !== null &&
    last.postId > (readState.threadLastPostId.get(row.id) ?? 0) &&
    last.at > (readState.forumReadAt.get(row.forumId) ?? new Date(0));
  return {
    id: row.id,
    title: row.title,
    href: threadHref(row),
    prefix: row.prefix,
    author: {
      userId: row.authorUserId,
      username: row.authorUsername,
      profileHref: row.authorUserId === null ? null : memberHref(row.authorUserId),
    },
    replyCount: row.replyCount,
    viewCount: row.viewCount,
    isSticky: row.isSticky,
    isLocked: row.isLocked,
    isUnread,
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
  readonly readState?: Pick<ReadState, "forumReadAt" | "threadLastPostId"> | null;
  readonly markReadAction?: string | null;
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
      // F39 owns new-thread creation. F32 supplies the native read form target.
      newThreadHref: null,
      markReadAction: input.markReadAction ?? null,
    },
    subforums:
      input.subforums.length === 0
        ? null
        : { forums: input.subforums.map(forum) },
    threads: input.page.rows.map((row) => threadRowModel(row, input.now, input.readState ?? null)),
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
