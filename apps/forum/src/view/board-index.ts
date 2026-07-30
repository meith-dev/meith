/**
 * The board index's view model (F29).
 *
 * Pure: it takes rows, a visibility set and a clock, and returns what the theme
 * renders. No repository, no `getActor()`, no `cookies()` — which is what lets
 * the interesting cases (a hidden parent, a deleted author, an empty forum) be
 * tested without a database or a request.
 *
 * ## Visibility is applied to the *tree*, not to the rows
 *
 * `visibleForumIds` answers per forum. Filtering the flat list by it and then
 * building the tree promotes a visible child of a hidden parent to the top
 * level — D22 noted `buildTree` does exactly that with orphans, and open
 * question 5 in `plan-status.md` asked whether F21 should filter subtrees whole.
 *
 * **This answers it: subtrees are filtered whole.** A forum the viewer cannot
 * see takes its descendants with it. The alternative leaks structure — a private
 * category's children appearing as top-level blocks tells a guest both that the
 * children exist and roughly what they are called — and it renders a board whose
 * shape depends on who is looking, which no administrator can reason about.
 *
 * The cost: a visible child under a hidden parent is unreachable from the index.
 * That is the correct reading of "the parent is hidden", and the ACP surfaces
 * such a forum as misconfigured (F65) rather than the index papering over it.
 */

import { buildTree, type ForumListingRow, type ForumNode } from '@forum/forums'
import type {
  BoardIndexModel,
  CategoryBlockModel,
  ForumRowModel,
  LastPostModel,
  LinkModel,
} from '@forum/theme-kit'

import { formatTime } from './time'
import { memberHref } from './member-profile'

export interface BoardIndexInput {
  readonly rows: readonly ForumListingRow[]
  /** From `Authorizer.visibleForumIds` (F21). */
  readonly visibleForumIds: ReadonlySet<number>
  /** F32: forums with at least one visible unread thread. */
  readonly unreadForumIds?: ReadonlySet<number>
  /** Null for guests and fixture mode. */
  readonly markAllReadAction?: string | null
  /** Injected so "Today" is testable and identical across one render. */
  readonly now: Date
}

/** `/forum/12-general` — id first so a rename never breaks a link. */
export function forumHref(row: { id: number; slug: string }): string {
  return `/forum/${row.id}-${row.slug}`
}

/**
 * A link row navigates away; everything else goes to its forum page.
 *
 * `linkUrl` is administrator-supplied and may be absolute and off-site, which is
 * why it is used verbatim rather than composed: a "link" forum whose target is
 * rewritten into a local path is a broken menu item, and F65 validates the URL
 * at the point it is entered.
 */
function hrefFor(row: ForumListingRow): string {
  if (row.type === 'link' && row.linkUrl !== null) return row.linkUrl
  return forumHref(row)
}

function threadHref(threadId: number, postId: number): string {
  return `/thread/${threadId}#post-${postId}`
}

function toLastPost(row: ForumListingRow, now: Date): LastPostModel | null {
  const last = row.lastPost
  if (last === null) return null

  return {
    threadTitle: last.threadTitle,
    href: threadHref(last.threadId, last.postId),
    author: {
      userId: last.userId,
      username: last.username,
      profileHref: last.userId === null ? null : memberHref(last.userId),
    },
    at: formatTime(last.at, now),
  }
}

function toForumRow(
  node: ForumNode<ForumListingRow>,
  now: Date,
  unreadForumIds: ReadonlySet<number> | undefined,
): ForumRowModel {
  return {
    id: node.id,
    title: node.title,
    description: node.description,
    href: hrefFor(node),
    type: node.type,
    threadCount: node.threadCount,
    postCount: node.postCount,
    lastPost: toLastPost(node, now),
    isUnread: unreadForumIds?.has(node.id) ?? false,
    subforums: node.children.map(
      (child): LinkModel => ({ label: child.title, href: hrefFor(child) }),
    ),
  }
}

/**
 * One block on the index: a heading and the forum rows under it.
 *
 * The rows are separate from the `CategoryBlockModel` rather than inside it
 * because a slot never renders another slot — the page maps these into the
 * block's `children`. So the model carries the heading and the page carries the
 * data it needs to render the rows.
 */
export interface BoardIndexBlock {
  readonly block: CategoryBlockModel
  readonly forums: readonly ForumRowModel[]
}

export interface BoardIndexView {
  /** Everything the `BoardIndex` slot needs except its regions. */
  readonly index: Omit<BoardIndexModel, 'regions'>
  readonly blocks: readonly BoardIndexBlock[]
}

/**
 * Build the index.
 *
 * Each top-level node becomes a block, whether it is a `category` or a forum
 * sitting at the root. MyBB renders both the same way, and a board that has not
 * created categories yet should still get a usable index rather than an empty
 * page — the heading is simply the forum's own title.
 *
 * Only the first two levels get rows: blocks, and the forums directly under them.
 * Deeper forums appear as `subforums` links on their parent's row, which is what
 * keeps the index a fixed size on a board with a deep tree.
 */
export function buildBoardIndexView(input: BoardIndexInput): BoardIndexView {
  const visible = input.rows.filter((row) => input.visibleForumIds.has(row.id))

  /*
   * Drop anything whose parent did not survive the filter, *before* building the
   * tree. `buildTree` promotes orphans to roots (D22), so without this a hidden
   * parent would surface its visible children as top-level blocks — see this
   * file's header for why that is a leak and not a convenience.
   *
   * Iterated to a fixed point: a grandchild whose parent was dropped for this
   * reason (rather than by the filter) has to go too, and one pass would keep it.
   */
  const survived = new Set(visible.map((row) => row.id))
  for (;;) {
    const orphaned = visible.filter(
      (row) =>
        survived.has(row.id) &&
        row.parentId !== null &&
        !survived.has(row.parentId),
    )
    if (orphaned.length === 0) break
    for (const row of orphaned) survived.delete(row.id)
  }

  const tree = buildTree(visible.filter((row) => survived.has(row.id)))

  return {
    index: {
      markAllReadAction: input.markAllReadAction ?? null,
    },
    blocks: tree.map((node) => ({
      block: { category: toForumRow(node, input.now, input.unreadForumIds) },
      forums: node.children.map((child) => toForumRow(child, input.now, input.unreadForumIds)),
    })),
  }
}
