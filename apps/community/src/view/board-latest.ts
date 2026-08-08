/**
 * The index sidebar's two live panels, as pure functions.
 *
 * Same shape as every other view model here: rows in, a clock and a timezone
 * in, a JSON-shaped model out. No repository, no `getActor()`, no `cookies()` —
 * which is what lets a deleted author, an empty board and a post made of one
 * pasted URL be tested without a database.
 *
 * ## The forum is on every row, and that is not decoration
 *
 * These are the only two lists on the board that cross the whole of it. A
 * sidebar row reading "Re: the meeting" says nothing about whether it happened
 * in the staff room or the pub thread, and two forums with a "General" thread
 * each would render as the same row twice. The forum comes out of the same
 * statement as the row, never a lookup per line.
 *
 * ## Why the excerpt is flattened rather than rendered
 *
 * A post's stored HTML carries quote blocks, directives, smilies and attachment
 * markup, all of which mean something only inside a post. Two lines of that in
 * a sidebar is either broken markup or a theme dropping raw HTML into a card —
 * so the panel shows the **text somebody typed**, flattened through the real
 * Markdown parser and cut on a word boundary. The same decision F76's feeds
 * made, for the same reason and with the same function.
 */
import { summarise } from '@meith/markdown'
import type {
  LatestPostModel,
  LatestPostsModel,
  LatestThreadModel,
  LatestThreadsModel,
} from '@meith/theme-kit'

import { forumHref } from './board-index'
import { nameClassOf, type MemberIdentity } from './member-identity'
import { memberHref } from './member-profile'
import { formatTime } from './time'

/** What the repository returns, restated so this module needs no `@meith/db`. */
export interface LatestThreadRow {
  readonly threadId: number
  readonly title: string
  readonly slug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly replyCount: number
  readonly createdAt: Date
}

export interface LatestPostRow {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly createdAt: Date
  readonly messageSource: string
}

export interface LatestInput<Row> {
  readonly rows: readonly Row[]
  /** Injected so one render has one clock, and so "Today" is testable. */
  readonly now: Date
  readonly timeZone?: string | undefined
  /** Group colours for the names shown, or absent on a board with none. */
  readonly identities?: ReadonlyMap<number, MemberIdentity>
}

/**
 * How much of a post a sidebar row shows.
 *
 * Two lines at the width of a sidebar. Long enough to tell whether the post is
 * worth opening, short enough that five of them do not push the board's
 * statistics off the screen — which is the whole reason the panel is a summary
 * rather than a list of posts.
 */
const EXCERPT_CHARS = 140

/**
 * The canonical permalink to a post.
 *
 * Both the query and the fragment, and each does a different job: `?post=` is
 * what lets the thread page open at the *page* the post is on, and `#post=` is
 * what scrolls to it once there. A bare fragment is a link that lands on page
 * one of a forty-page thread and does nothing visible — which is the version
 * that reads as broken rather than as missing.
 */
function postHref(row: LatestPostRow): string {
  return `/thread/${row.threadId}-${row.threadSlug}?post=${row.postId}#post-${row.postId}`
}

function authorOf(
  row: { authorUserId: number | null; authorUsername: string },
  identities: ReadonlyMap<number, MemberIdentity> | undefined,
) {
  return {
    userId: row.authorUserId,
    username: row.authorUsername,
    /*
     * A name with no id is still a name worth showing: the account may have
     * been deleted since the post, and `UserRefModel` has carried a null
     * `userId` for exactly that since F29.
     */
    profileHref: row.authorUserId === null ? null : memberHref(row.authorUserId),
    nameClass: nameClassOf(identities, row.authorUserId),
  }
}

export function buildLatestThreadsModel(
  input: LatestInput<LatestThreadRow>,
): LatestThreadsModel {
  const threads: LatestThreadModel[] = input.rows.map((row) => ({
    title: row.title,
    href: `/thread/${row.threadId}-${row.slug}`,
    forum: {
      label: row.forumTitle,
      href: forumHref({ id: row.forumId, slug: row.forumSlug }),
    },
    author: authorOf(row, input.identities),
    replyCount: row.replyCount,
    startedAt: formatTime(row.createdAt, input.now, input.timeZone),
  }))

  return { threads, capturedAt: formatTime(input.now, input.now, input.timeZone) }
}

export function buildLatestPostsModel(input: LatestInput<LatestPostRow>): LatestPostsModel {
  const posts: LatestPostModel[] = input.rows.map((row) => ({
    threadTitle: row.threadTitle,
    href: postHref(row),
    forum: {
      label: row.forumTitle,
      href: forumHref({ id: row.forumId, slug: row.forumSlug }),
    },
    author: authorOf(row, input.identities),
    excerpt: summarise(row.messageSource, EXCERPT_CHARS),
    postedAt: formatTime(row.createdAt, input.now, input.timeZone),
  }))

  return { posts, capturedAt: formatTime(input.now, input.now, input.timeZone) }
}
