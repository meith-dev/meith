import { type CacheDriver, CacheTags, cachedGlobal } from '@meith/core'

import type { ForumRepository } from './ports'
import type { ForumListingRow, ForumRow, MovePlan, MoveTarget, NewForum } from './types'

const TREE_KEY = ['forum-tree'] as const

export const TREE_TTL_SECONDS = 60

export class CachedForumRepository implements ForumRepository {
  constructor(
    private readonly inner: ForumRepository,
    private readonly cache: CacheDriver,
  ) {}

  async listAll(): Promise<ForumRow[]> {
    return cachedGlobal(
      this.cache,
      {
        key: TREE_KEY,
        tags: [CacheTags.forumTree()],
        revalidate: TREE_TTL_SECONDS,
      },
      () => this.inner.listAll(),
    )
  }

  async listListing(): Promise<ForumListingRow[]> {
    return this.inner.listListing()
  }

  async findById(id: number): Promise<ForumRow | null> {
    return (await this.listAll()).find((row) => row.id === id) ?? null
  }

  async create(input: NewForum): Promise<ForumRow> {
    const created = await this.inner.create(input)
    await this.invalidate()
    return created
  }

  async move(forumId: number, target: MoveTarget): Promise<void> {
    await this.inner.move(forumId, target)
    await this.invalidate()
  }

  async applyMove(plan: MovePlan): Promise<void> {
    await this.inner.applyMove(plan)
    await this.invalidate()
  }

  private async invalidate(): Promise<void> {
    await this.cache.invalidateTags([CacheTags.forumTree()])
  }
}
