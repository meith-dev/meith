/** F31's pure thread-view model. */
import { postBodyHtml } from '@forum/bbcode'
import type { ForumRow } from '@forum/forums'
import type { PaginationModel, PostBitModel, ThreadViewModel } from '@forum/theme-kit'
import type { PostListingRow, PostPage } from '@forum/posts'
import type { ThreadListingRow } from '@forum/threads'

import { forumHref } from './board-index'
import { threadRowModel } from './forum-display'
import { memberHref } from './member-profile'
import { formatTime } from './time'

function post(
  post: PostListingRow,
  thread: ThreadListingRow,
  now: Date,
  replyHref: string | null,
): PostBitModel {
  return {
    id: post.id,
    number: post.number,
    permalink: `/thread/${thread.id}-${thread.slug}#post-${post.id}`,
    author: {
      userId: post.authorUserId,
      username: post.authorUsername,
      profileHref: post.authorUserId === null ? null : memberHref(post.authorUserId),
      avatarUrl: null,
      title: null,
      postCount: post.authorPostCount,
      joinedAt: post.authorJoinedAt === null ? null : formatTime(post.authorJoinedAt, now),
      signatureHtml: null,
      isOnline: false,
    },
    /*
     * The only place a post body becomes markup (F36). `postBodyHtml` prefers
     * the render stored with the post and falls back to rendering the raw
     * BBCode here when that render is missing or was produced by an older
     * version of the renderer — so a body is never shown by a renderer other
     * than the current one, and never fails to be shown because a task has not
     * caught up.
     */
    bodyHtml: postBodyHtml(post),
    postedAt: formatTime(post.createdAt, now),
    editedNote: null,
    isFirstPost: post.isFirstPost,
    visibility: post.visibility,
    actions: {
      /*
       * Quoting is the reply form with a prefill, so it is the same route and
       * the same permission — there is no separate "may quote" to resolve, and
       * an actor who cannot reply is offered neither.
       */
      quoteHref: replyHref === null ? null : `${replyHref}?quote=${post.id}`,
      editHref: null,
      reportHref: null,
      moderateHref: null,
    },
  }
}

export interface ThreadViewInput {
  readonly thread: ThreadListingRow
  readonly forum: ForumRow
  readonly page: PostPage
  readonly pageNumber: number
  readonly nextHref: string | null
  readonly markReadAction?: string | null
  /** Where the reply form lives, or `null` when this viewer may not reply. */
  readonly replyHref?: string | null
  readonly now: Date
}

export interface ThreadView {
  readonly view: Omit<ThreadViewModel, 'regions'>
  readonly posts: readonly PostBitModel[]
  readonly pagination: PaginationModel
}

export function buildThreadView(input: ThreadViewInput): ThreadView {
  return {
    view: {
      thread: threadRowModel(input.thread, input.now),
      forum: { label: input.forum.title, href: forumHref(input.forum) },
      replyHref: input.replyHref ?? null,
      markReadAction: input.markReadAction ?? null,
    },
    posts: input.page.rows.map((entry) =>
      post(entry, input.thread, input.now, input.replyHref ?? null),
    ),
    pagination: {
      page: input.pageNumber,
      pageCount: input.pageNumber,
      pages: [{ page: input.pageNumber, href: '', isCurrent: true }],
      previousHref: null,
      nextHref: input.nextHref,
    },
  }
}
