export const FORUM_TYPES = ['category', 'forum', 'link'] as const
export type ForumType = (typeof FORUM_TYPES)[number]

export interface TreeShaped {
  readonly id: number
  readonly parentId: number | null
  readonly displayOrder: number
}

export interface ForumRow extends TreeShaped {
  readonly type: ForumType
  readonly title: string
  readonly slug: string
  readonly description: string | null
  readonly path: string
  readonly depth: number
  readonly linkUrl: string | null
}

export type ForumNode<T extends TreeShaped = ForumRow> = T & {
  readonly children: readonly ForumNode<T>[]
}

export interface LastPostSummary {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly userId: number | null
  readonly username: string
  readonly at: Date
}

export interface ForumListingRow extends ForumRow {
  readonly allowThreads: boolean
  readonly threadCount: number
  readonly postCount: number
  readonly lastPost: LastPostSummary | null
}

export interface NewForum {
  readonly type: ForumType
  readonly title: string
  readonly slug: string
  readonly description?: string | undefined
  readonly parentId: number | null
  readonly linkUrl?: string | undefined
  readonly displayOrder?: number | undefined
}

export interface MoveTarget {
  readonly newParentId: number | null
  readonly position?: number
  readonly after?: number | null
}

export interface PathUpdate {
  readonly id: number
  readonly path: string
  readonly depth: number
}

export interface MovePlan {
  readonly forumId: number
  readonly newParentId: number | null
  readonly pathUpdates: readonly PathUpdate[]
  readonly orderUpdates: readonly { readonly id: number; readonly displayOrder: number }[]
}
