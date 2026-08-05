/** F30's pure forum-display view model. */
import type { ForumListingRow } from "@meith/forums";
import type {
  ForumDisplayModel,
  ForumRowModel,
  LastPostModel,
  PaginationModel,
  SubforumListModel,
  ThreadRowModel,
} from "@meith/theme-kit";
import type { ReadState, ThreadListingRow, ThreadPage } from "@meith/threads";

import { forumHref } from "./board-index";
import { nameClassOf, type MemberIdentity } from "./member-identity";
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
  timeZone: string | undefined,
  identities: ReadonlyMap<number, MemberIdentity> | undefined,
): LastPostModel | null {
  if (!post) return null;
  return {
    threadTitle: thread.title,
    href: `${threadHref(thread)}#post-${post.postId}`,
    author: {
      userId: post.userId,
      username: post.username,
      profileHref: post.userId === null ? null : memberHref(post.userId),
      nameClass: nameClassOf(identities, post.userId),
    },
    at: formatTime(post.at, now, timeZone),
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
  /** F57's viewer zone. Defaults to UTC, as every timestamp did before it. */
  timeZone?: string,
  /**
   * The group colours for the names in this row, or `undefined`.
   *
   * Optional and last, because two callers build a thread row — the forum
   * listing and the thread page's own header — and only one of them has a page
   * full of names to resolve. A caller that passes nothing gets exactly the row
   * this function returned before group colours existed.
   */
  identities?: ReadonlyMap<number, MemberIdentity>,
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
      nameClass: nameClassOf(identities, row.authorUserId),
    },
    replyCount: row.replyCount,
    viewCount: row.viewCount,
    isSticky: row.isSticky,
    isLocked: row.isLocked,
    isUnread,
    isMoved: row.isMoved,
    lastPost: lastPost(row.lastPost, row, now, timeZone, identities),
  };
}

export interface ForumDisplayInput {
  readonly forum: ForumListingRow;
  readonly subforums: readonly ForumListingRow[];
  readonly page: ThreadPage;
  readonly pageNumber: number;
  readonly nextHref: string | null;
  /**
   * Where the composer lives, or `null` when this viewer may not post here —
   * a link nobody may follow is an invitation to a 404 (F39).
   */
  readonly newThreadHref?: string | null;
  readonly readState?: Pick<ReadState, "forumReadAt" | "threadLastPostId"> | null;
  readonly markReadAction?: string | null;
  readonly now: Date;
  /**
   * The viewer's timezone (F57). Defaults to UTC — the zone every timestamp on
   * this board used before members could choose one.
   */
  readonly timeZone?: string;
  /**
   * The group colours for every name on this page, resolved in one query.
   *
   * Optional, and an empty map is a real answer rather than a missing one: a
   * board with no coloured groups produces exactly what this page rendered
   * before they existed.
   */
  readonly identities?: ReadonlyMap<number, MemberIdentity>;
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
      newThreadHref: input.newThreadHref ?? null,
      markReadAction: input.markReadAction ?? null,
    },
    subforums:
      input.subforums.length === 0
        ? null
        : { forums: input.subforums.map(forum) },
    threads: input.page.rows.map((row) =>
      threadRowModel(row, input.now, input.readState ?? null, input.timeZone, input.identities),
    ),
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
