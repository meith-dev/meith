/** F30's pure community-display view model. */
import type { CommunityListingRow } from "@meith/communities";
import type {
  CommunityDisplayModel,
  CommunityRowModel,
  LastPostModel,
  PaginationModel,
  SubcommunityListModel,
  ThreadRowModel,
} from "@meith/theme-kit";
import type { ReadState, ThreadListingRow, ThreadPage } from "@meith/threads";

import { communityHref } from "./board-index";
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

function community(row: CommunityListingRow): CommunityRowModel {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    href: communityHref(row),
    type: row.type,
    threadCount: row.threadCount,
    postCount: row.postCount,
    lastPost: null,
    isUnread: false,
    subcommunities: [],
  };
}

export function threadRowModel(
  row: ThreadListingRow,
  now: Date,
  readState: Pick<ReadState, "communityReadAt" | "threadLastPostId"> | null = null,
  /** F57's viewer zone. Defaults to UTC, as every timestamp did before it. */
  timeZone?: string,
  /**
   * The group colours for the names in this row, or `undefined`.
   *
   * Optional and last, because two callers build a thread row — the community
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
    last.at > (readState.communityReadAt.get(row.communityId) ?? new Date(0));
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

export interface CommunityDisplayInput {
  readonly community: CommunityListingRow;
  readonly subcommunities: readonly CommunityListingRow[];
  readonly page: ThreadPage;
  readonly pageNumber: number;
  readonly nextHref: string | null;
  /**
   * Where the composer lives, or `null` when this viewer may not post here —
   * a link nobody may follow is an invitation to a 404 (F39).
   */
  readonly newThreadHref?: string | null;
  readonly readState?: Pick<ReadState, "communityReadAt" | "threadLastPostId"> | null;
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

export interface CommunityDisplayView {
  readonly display: Omit<CommunityDisplayModel, "regions">;
  readonly subcommunities: SubcommunityListModel | null;
  readonly threads: readonly ThreadRowModel[];
  readonly pagination: PaginationModel;
}

export function buildCommunityDisplayView(
  input: CommunityDisplayInput,
): CommunityDisplayView {
  return {
    display: {
      community: community(input.community),
      newThreadHref: input.newThreadHref ?? null,
      markReadAction: input.markReadAction ?? null,
    },
    subcommunities:
      input.subcommunities.length === 0
        ? null
        : { communities: input.subcommunities.map(community) },
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
