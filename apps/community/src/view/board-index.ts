/**
 * The board index's view model (F29).
 *
 * Pure: it takes rows, a visibility set and a clock, and returns what the theme
 * renders. No repository, no `getActor()`, no `cookies()` — which is what lets
 * the interesting cases (a hidden parent, a deleted author, an empty community) be
 * tested without a database or a request.
 *
 * ## Visibility is applied to the *tree*, not to the rows
 *
 * `visibleCommunityIds` answers per community. Filtering the flat list by it and then
 * building the tree promotes a visible child of a hidden parent to the top
 * level — D22 noted `buildTree` does exactly that with orphans, and open
 * question 5 in `plan-status.md` asked whether F21 should filter subtrees whole.
 *
 * **This answers it: subtrees are filtered whole.** A community the viewer cannot
 * see takes its descendants with it. The alternative leaks structure — a private
 * category's children appearing as top-level blocks tells a guest both that the
 * children exist and roughly what they are called — and it renders a board whose
 * shape depends on who is looking, which no administrator can reason about.
 *
 * The cost: a visible child under a hidden parent is unreachable from the index.
 * That is the correct reading of "the parent is hidden", and the ACP surfaces
 * such a community as misconfigured (F65) rather than the index papering over it.
 */

import {
  buildTree,
  keepVisibleSubtrees,
  type CommunityListingRow,
  type CommunityNode,
} from '@meith/communities'
import type {
  BoardIndexModel,
  CategoryBlockModel,
  CommunityRowModel,
  LastPostModel,
  LinkModel,
} from '@meith/theme-kit'

import { formatTime } from './time'
import { nameClassOf, type MemberIdentity } from './member-identity'
import { memberHref } from './member-profile'

export interface BoardIndexInput {
  readonly rows: readonly CommunityListingRow[]
  /** From `Authorizer.visibleCommunityIds` (F21). */
  readonly visibleCommunityIds: ReadonlySet<number>
  /** F32: communities with at least one visible unread thread. */
  readonly unreadCommunityIds?: ReadonlySet<number>
  /** Null for guests and fixture mode. */
  readonly markAllReadAction?: string | null
  /** Injected so "Today" is testable and identical across one render. */
  readonly now: Date
  /**
   * The viewer's timezone (F57). Defaults to UTC — the zone every timestamp on
   * this board used before members could choose one.
   */
  readonly timeZone?: string
  /**
   * The group colours for every last-poster on the index, in one query.
   *
   * Optional, and an empty map is a real answer rather than a missing one: a
   * board with no coloured groups renders exactly what it did before they
   * existed.
   */
  readonly identities?: ReadonlyMap<number, MemberIdentity>
}

/** `/12-general` — id first so a rename never breaks a link. */
export function communityHref(row: { id: number; slug: string }): string {
  return `/${row.id}-${row.slug}`
}

/**
 * A link row navigates away; everything else goes to its community page.
 *
 * `linkUrl` is administrator-supplied and may be absolute and off-site, which is
 * why it is used verbatim rather than composed: a "link" community whose target is
 * rewritten into a local path is a broken menu item, and F65 validates the URL
 * at the point it is entered.
 */
function hrefFor(row: CommunityListingRow): string {
  if (row.type === 'link' && row.linkUrl !== null) return row.linkUrl
  return communityHref(row)
}

function threadHref(threadId: number, postId: number): string {
  return `/thread/${threadId}#post-${postId}`
}

function toLastPost(
  row: CommunityListingRow,
  now: Date,
  timeZone: string | undefined,
  identities: ReadonlyMap<number, MemberIdentity> | undefined,
): LastPostModel | null {
  const last = row.lastPost
  if (last === null) return null

  return {
    threadTitle: last.threadTitle,
    href: threadHref(last.threadId, last.postId),
    author: {
      userId: last.userId,
      username: last.username,
      profileHref: last.userId === null ? null : memberHref(last.userId),
      nameClass: nameClassOf(identities, last.userId),
    },
    at: formatTime(last.at, now, timeZone),
  }
}

function toCommunityRow(
  node: CommunityNode<CommunityListingRow>,
  now: Date,
  timeZone: string | undefined,
  unreadCommunityIds: ReadonlySet<number> | undefined,
  identities: ReadonlyMap<number, MemberIdentity> | undefined,
): CommunityRowModel {
  return {
    id: node.id,
    title: node.title,
    description: node.description,
    href: hrefFor(node),
    type: node.type,
    threadCount: node.threadCount,
    postCount: node.postCount,
    lastPost: toLastPost(node, now, timeZone, identities),
    isUnread: unreadCommunityIds?.has(node.id) ?? false,
    subcommunities: node.children.map(
      (child): LinkModel => ({ label: child.title, href: hrefFor(child) }),
    ),
  }
}

/**
 * One block on the index: a heading and the community rows under it.
 *
 * The rows are separate from the `CategoryBlockModel` rather than inside it
 * because a slot never renders another slot — the page maps these into the
 * block's `children`. So the model carries the heading and the page carries the
 * data it needs to render the rows.
 */
export interface BoardIndexBlock {
  readonly block: CategoryBlockModel
  readonly communities: readonly CommunityRowModel[]
}

export interface BoardIndexView {
  /** Everything the `BoardIndex` slot needs except its regions. */
  readonly index: Omit<BoardIndexModel, 'regions'>
  readonly blocks: readonly BoardIndexBlock[]
}

/**
 * Build the index.
 *
 * Each top-level node becomes a block, whether it is a `category` or a community
 * sitting at the root. MyBB renders both the same way, and a board that has not
 * created categories yet should still get a usable index rather than an empty
 * page — the heading is simply the community's own title.
 *
 * Only the first two levels get rows: blocks, and the communities directly under them.
 * Deeper communities appear as `subcommunities` links on their parent's row, which is what
 * keeps the index a fixed size on a board with a deep tree.
 */
export function buildBoardIndexView(input: BoardIndexInput): BoardIndexView {
  /*
   * Whole subtrees, not rows. `buildTree` promotes orphans to roots (D22), so
   * filtering row-by-row would surface a hidden parent's visible children as
   * top-level blocks — see this file's header for why that is a leak. The rule
   * moved to `@meith/communities` when the jump box (F27) became its second caller.
   */
  const tree = buildTree(keepVisibleSubtrees(input.rows, (row) => input.visibleCommunityIds.has(row.id)))

  return {
    index: {
      markAllReadAction: input.markAllReadAction ?? null,
    },
    blocks: tree.map((node) => ({
      block: {
        category: toCommunityRow(
          node,
          input.now,
          input.timeZone,
          input.unreadCommunityIds,
          input.identities,
        ),
      },
      communities: node.children.map((child) =>
        toCommunityRow(child, input.now, input.timeZone, input.unreadCommunityIds, input.identities),
      ),
    })),
  }
}
