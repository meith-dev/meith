/** F31's pure thread-view model. */
import type { ForumRow } from '@forum/forums'
import type { PaginationModel, PostBitModel, ThreadViewModel } from '@forum/theme-kit'
import type { PostListingRow, PostPage } from '@forum/posts'
import type { ThreadListingRow } from '@forum/threads'

import { forumHref } from './board-index'
import { threadRowModel } from './forum-display'
import { formatTime } from './time'

function plainTextHtml(message: string): string {
  return message
    .replace(/[&<>"']/g, (character) => {
      const escaped: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }
      return escaped[character]!
    })
    .replace(/\n/g, '<br>\n')
}

function post(post: PostListingRow, thread: ThreadListingRow, now: Date): PostBitModel {
  return {
    id: post.id,
    number: post.number,
    permalink: `/thread/${thread.id}-${thread.slug}#post-${post.id}`,
    author: {
      userId: post.authorUserId,
      username: post.authorUsername,
      profileHref: null,
      avatarUrl: null,
      title: null,
      postCount: post.authorPostCount,
      joinedAt: post.authorJoinedAt === null ? null : formatTime(post.authorJoinedAt, now),
      signatureHtml: null,
      isOnline: false,
    },
    // F36 replaces this safe plain-text fallback with the BBCode renderer.
    bodyHtml: plainTextHtml(post.message),
    postedAt: formatTime(post.createdAt, now),
    editedNote: null,
    isFirstPost: post.isFirstPost,
    visibility: post.visibility,
    actions: {
      quoteHref: null,
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
      // F40/F45 own reply routes and the enhancement island.
      replyHref: null,
    },
    posts: input.page.rows.map((entry) => post(entry, input.thread, input.now)),
    pagination: {
      page: input.pageNumber,
      pageCount: input.pageNumber,
      pages: [{ page: input.pageNumber, href: '', isCurrent: true }],
      previousHref: null,
      nextHref: input.nextHref,
    },
  }
}
