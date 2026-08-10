import {
  buildTree,
  keepVisibleSubtrees,
  type ForumListingRow,
  type ForumNode,
} from '@meith/forums'
import type {
  BoardIndexModel,
  CategoryBlockModel,
  ForumRowModel,
  LastPostModel,
  LinkModel,
} from '@meith/theme-kit'

import { formatTime } from './time'
import { nameClassOf, type MemberIdentity } from './member-identity'
import { memberHref } from './member-profile'
import { postAnchor } from './post-anchor'

export interface BoardIndexInput {
  readonly rows: readonly ForumListingRow[]
  readonly visibleForumIds: ReadonlySet<number>
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
  return `/thread/${threadId}#${postAnchor(postId)}`
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
): ForumRowModel {
  return {
    id: node.id,
    title: node.title,
    description: node.description,
    href: hrefFor(node),
    type: node.type,
    threadCount: node.threadCount,
    postCount: node.postCount,
    lastPost: toLastPost(node, now, timeZone, identities),
    isUnread: unreadForumIds?.has(node.id) ?? false,
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

export function buildBoardIndexView(input: BoardIndexInput): BoardIndexView {
  const tree = buildTree(keepVisibleSubtrees(input.rows, (row) => input.visibleForumIds.has(row.id)))

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
        ),
      },
      forums: node.children.map((child) =>
        toForumRow(child, input.now, input.timeZone, input.unreadForumIds, input.identities),
      ),
    })),
  }
}
