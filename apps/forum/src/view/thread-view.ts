/** F31's pure thread-view model, with F41's edit and delete affordances. */
import { postBodyHtml } from '@forum/bbcode'
import type { ForumRow } from '@forum/forums'
import type { PaginationModel, PostBitModel, ThreadViewModel } from '@forum/theme-kit'
import { editedNote, type PostListingRow, type PostPage } from '@forum/posts'
import type { ThreadListingRow } from '@forum/threads'

import { forumHref } from './board-index'
import { threadRowModel } from './forum-display'
import { memberHref } from './member-profile'
import { formatTime } from './time'

/**
 * What this viewer may do to a post, already resolved by the page.
 *
 * Capabilities, not permissions: the matrix stays inside
 * `@forum/authorization` (R4), and what reaches the view model is a set of
 * answers. Every one of them is re-asked by the action that acts on it — a link
 * is not authorisation.
 */
export interface PostCapabilities {
  readonly viewerUserId: number | null
  readonly editOwn: boolean
  readonly editOthers: boolean
  readonly softDelete: boolean
  /**
   * The combined `editTimeLimitMinutes`, where 0 is unlimited (R4.2).
   *
   * Used only to *hide a link that would be refused*. The window is enforced by
   * `PostEditor`; repeating it here keeps the page from offering an Edit link on
   * a three-year-old post that the next screen will reject.
   */
  readonly editWindowMinutes: number
  /** Set when the actor may edit regardless of the window (moderation). */
  readonly bypassesWindow: boolean
}

const NO_CAPABILITIES: PostCapabilities = {
  viewerUserId: null,
  editOwn: false,
  editOthers: false,
  softDelete: false,
  editWindowMinutes: 0,
  bypassesWindow: false,
}

function withinEditWindow(
  post: PostListingRow,
  capabilities: PostCapabilities,
  now: Date,
): boolean {
  if (capabilities.bypassesWindow || capabilities.editWindowMinutes <= 0) return true
  const elapsed = (now.getTime() - post.createdAt.getTime()) / 60_000
  return elapsed <= capabilities.editWindowMinutes
}

function post(
  post: PostListingRow,
  thread: ThreadListingRow,
  now: Date,
  replyHref: string | null,
  capabilities: PostCapabilities,
): PostBitModel {
  const isOwn =
    capabilities.viewerUserId !== null && post.authorUserId === capabilities.viewerUserId
  const manageHref = `/thread/${thread.id}-${thread.slug}/edit?post=${post.id}`

  const mayEdit =
    post.visibility !== 'deleted' &&
    (isOwn
      ? capabilities.editOwn && withinEditWindow(post, capabilities, now)
      : capabilities.editOthers)

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
    /*
     * Shown to everyone who can see the post, reason included. An edit notice
     * exists to tell readers the text changed after they might have read it;
     * showing it selectively would defeat the point.
     */
    editedNote: editedNote(
      { editedAt: post.editedAt, editedByUsername: post.editedByUsername, reason: post.editReason },
      (at) => formatTime(at, now).label,
    ),
    isFirstPost: post.isFirstPost,
    visibility: post.visibility,
    actions: {
      /*
       * Quoting is the reply form with a prefill, so it is the same route and
       * the same permission — there is no separate "may quote" to resolve, and
       * an actor who cannot reply is offered neither. A deleted post is not
       * quotable: its body is only on the page because a moderator is reading it.
       */
      quoteHref:
        replyHref === null || post.visibility !== 'visible'
          ? null
          : `${replyHref}?quote=${post.id}`,
      editHref: mayEdit ? manageHref : null,
      restoreHref:
        post.visibility === 'deleted' && capabilities.softDelete ? manageHref : null,
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
  /** F41. Omitted for a guest, who may do nothing to a post. */
  readonly capabilities?: PostCapabilities
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
      post(
        entry,
        input.thread,
        input.now,
        input.replyHref ?? null,
        input.capabilities ?? NO_CAPABILITIES,
      ),
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
