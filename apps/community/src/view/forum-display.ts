import type { ForumListingRow } from '@meith/forums'
import type { Translator } from '@meith/i18n'
import type { CompiledWordFilter } from '@meith/markdown'
import type {
  ForumDisplayModel,
  ForumRowModel,
  LastPostModel,
  PaginationModel,
  SubforumListModel,
  ThreadRowModel,
} from '@meith/theme-kit'
import type { ReadState, ThreadListingRow, ThreadPage } from '@meith/threads'

import { forumHref } from './board-index'
import { count } from './count'
import { type MemberIdentity, nameClassOf } from './member-identity'
import { memberHref } from './member-profile'
import { postLink } from './post-link'
import { formatTime } from './time'
import { filterWords } from './word-filter'

export function threadHref(row: ThreadListingRow): string {
  return `/thread/${row.id}-${row.slug}`
}

function lastPost(
  post: {
    readonly postId: number
    readonly userId: number | null
    readonly username: string
    readonly at: Date
  } | null,
  thread: ThreadListingRow,
  now: Date,
  t: Translator | undefined,
  identities: ReadonlyMap<number, MemberIdentity> | undefined,
  wordFilter: CompiledWordFilter | undefined,
): LastPostModel | null {
  if (!post) return null
  return {
    threadTitle: filterWords(thread.title, wordFilter),
    href: postLink(threadHref(thread), post.postId),
    author: {
      userId: post.userId,
      username: post.username,
      profileHref: post.userId === null ? null : memberHref(post.userId),
      nameClass: nameClassOf(identities, post.userId),
    },
    at: formatTime(post.at, now, t),
  }
}

function forum(
  row: ForumListingRow,
  ownThreadsOnlyForumIds: ReadonlySet<number> | undefined,
  t: Translator | undefined,
): ForumRowModel {
  const ownThreadsOnly = ownThreadsOnlyForumIds?.has(row.id) ?? false
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    href: forumHref(row),
    type: row.type,
    threadCount: count(ownThreadsOnly ? 0 : row.threadCount, t),
    postCount: count(ownThreadsOnly ? 0 : row.postCount, t),
    lastPost: null,
    isUnread: false,
    subforums: [],
  }
}

export function threadRowModel(
  row: ThreadListingRow,
  now: Date,
  readState: Pick<ReadState, 'forumReadAt' | 'threadLastPostId'> | null = null,
  t?: Translator,
  identities?: ReadonlyMap<number, MemberIdentity>,
  wordFilter?: CompiledWordFilter | undefined,
): ThreadRowModel {
  const last = row.lastPost
  const isUnread =
    last !== null &&
    readState !== null &&
    last.postId > (readState.threadLastPostId.get(row.id) ?? 0) &&
    last.at > (readState.forumReadAt.get(row.forumId) ?? new Date(0))
  return {
    id: row.id,
    title: filterWords(row.title, wordFilter),
    href: threadHref(row),
    prefix: row.prefix,
    author: {
      userId: row.authorUserId,
      username: row.authorUsername,
      profileHref: row.authorUserId === null ? null : memberHref(row.authorUserId),
      nameClass: nameClassOf(identities, row.authorUserId),
    },
    replyCount: count(row.replyCount, t),
    viewCount: count(row.viewCount, t),
    isSticky: row.isSticky,
    isLocked: row.isLocked,
    isUnread,
    isMoved: row.isMoved,
    visibility: row.visibility,
    lastPost: lastPost(row.lastPost, row, now, t, identities, wordFilter),
  }
}

export interface ForumDisplayInput {
  readonly forum: ForumListingRow
  readonly subforums: readonly ForumListingRow[]
  readonly ownThreadsOnlyForumIds?: ReadonlySet<number>
  readonly page: ThreadPage
  readonly pageNumber: number
  readonly nextHref: string | null
  readonly pagination?: PaginationModel
  readonly newThreadHref?: string | null
  readonly readState?: Pick<ReadState, 'forumReadAt' | 'threadLastPostId'> | null
  readonly markReadAction?: string | null
  readonly now: Date
  readonly t?: Translator
  readonly identities?: ReadonlyMap<number, MemberIdentity>
  readonly wordFilter?: CompiledWordFilter | undefined
}

export interface ForumDisplayView {
  readonly display: Omit<ForumDisplayModel, 'regions'>
  readonly subforums: SubforumListModel | null
  readonly threads: readonly ThreadRowModel[]
  readonly pagination: PaginationModel
}

export function buildForumDisplayView(input: ForumDisplayInput): ForumDisplayView {
  return {
    display: {
      forum: forum(input.forum, input.ownThreadsOnlyForumIds, input.t),
      newThreadHref: input.newThreadHref ?? null,
      markReadAction: input.markReadAction ?? null,
    },
    subforums:
      input.subforums.length === 0
        ? null
        : {
            forums: input.subforums.map((row) => forum(row, input.ownThreadsOnlyForumIds, input.t)),
          },
    threads: input.page.rows.map((row) =>
      threadRowModel(
        row,
        input.now,
        input.readState ?? null,
        input.t,
        input.identities,
        input.wordFilter,
      ),
    ),
    pagination: input.pagination ?? {
      page: input.pageNumber,
      pageCount: input.pageNumber,
      pageCountIsExact: false,
      pages: [{ page: input.pageNumber, href: '', isCurrent: true }],
      previousHref: null,
      nextHref: input.nextHref,
    },
  }
}
