import { buildTree, type ForumListingRow, type ForumNode, keepVisibleSubtrees } from '@meith/forums'
import type {
  BoardIndexModel,
  CategoryBlockModel,
  ForumRowModel,
  LastPostModel,
  LinkModel,
} from '@meith/theme-kit'

import { type MemberIdentity, nameClassOf } from './member-identity'
import { memberHref } from './member-profile'
import { postLink } from './post-link'
import { formatTime } from './time'

export interface BoardIndexInput {
  readonly rows: readonly ForumListingRow[]
  readonly visibleForumIds: ReadonlySet<number>
  readonly ownThreadsOnlyForumIds?: ReadonlySet<number>
  readonly unreadForumIds?: ReadonlySet<number>
  readonly markAllReadAction?: string | null
  readonly now: Date
  readonly timeZone?: string
  readonly identities?: ReadonlyMap<number, MemberIdentity>
}

export function forumHref(row: { id: number; slug: string }): string {
  return `/${row.id}-${row.slug}`
}

function hrefFor(row: ForumListingRow): string {
  if (row.type === 'link' && row.linkUrl !== null) return row.linkUrl
  return forumHref(row)
}

function threadHref(threadId: number, postId: number): string {
  return postLink(`/thread/${threadId}`, postId)
}

function toLastPost(
  row: ForumListingRow,
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

function toForumRow(
  node: ForumNode<ForumListingRow>,
  now: Date,
  timeZone: string | undefined,
  unreadForumIds: ReadonlySet<number> | undefined,
  identities: ReadonlyMap<number, MemberIdentity> | undefined,
  ownThreadsOnlyForumIds: ReadonlySet<number> | undefined,
): ForumRowModel {
  const ownThreadsOnly = ownThreadsOnlyForumIds?.has(node.id) ?? false

  return {
    id: node.id,
    title: node.title,
    description: node.description,
    href: hrefFor(node),
    type: node.type,
    threadCount: ownThreadsOnly ? 0 : node.threadCount,
    postCount: ownThreadsOnly ? 0 : node.postCount,
    lastPost: ownThreadsOnly ? null : toLastPost(node, now, timeZone, identities),
    isUnread: !ownThreadsOnly && (unreadForumIds?.has(node.id) ?? false),
    subforums: node.children.map(
      (child): LinkModel => ({ label: child.title, href: hrefFor(child) }),
    ),
  }
}

export interface BoardIndexBlock {
  readonly block: CategoryBlockModel
  readonly forums: readonly ForumRowModel[]
}

export interface BoardIndexView {
  readonly index: Omit<BoardIndexModel, 'regions'>
  readonly blocks: readonly BoardIndexBlock[]
}

export interface SectionInput extends BoardIndexInput {
  readonly categoryId: number
}

function findNode(
  nodes: readonly ForumNode<ForumListingRow>[],
  id: number,
): ForumNode<ForumListingRow> | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found !== null) return found
  }
  return null
}

export function buildSectionView(input: SectionInput): BoardIndexBlock | null {
  const tree = buildTree(
    keepVisibleSubtrees(input.rows, (row) => input.visibleForumIds.has(row.id)),
  )
  const node = findNode(tree, input.categoryId)
  if (node === null) return null

  const row = (candidate: ForumNode<ForumListingRow>): ForumRowModel =>
    toForumRow(
      candidate,
      input.now,
      input.timeZone,
      input.unreadForumIds,
      input.identities,
      input.ownThreadsOnlyForumIds,
    )

  return { block: { category: row(node) }, forums: node.children.map(row) }
}

export function buildBoardIndexView(input: BoardIndexInput): BoardIndexView {
  const tree = buildTree(
    keepVisibleSubtrees(input.rows, (row) => input.visibleForumIds.has(row.id)),
  )

  return {
    index: {
      markAllReadAction: input.markAllReadAction ?? null,
    },
    blocks: tree.map((node) => ({
      block: {
        category: toForumRow(
          node,
          input.now,
          input.timeZone,
          input.unreadForumIds,
          input.identities,
          input.ownThreadsOnlyForumIds,
        ),
      },
      forums: node.children.map((child) =>
        toForumRow(
          child,
          input.now,
          input.timeZone,
          input.unreadForumIds,
          input.identities,
          input.ownThreadsOnlyForumIds,
        ),
      ),
    })),
  }
}
