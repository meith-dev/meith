/**
 * Tag-invalidated cache in front of a `ForumRepository` (F16 + F10).
 *
 * The forum tree is the archetypal cacheable read: every page needs it, it is
 * global (structure is the same for everyone — *visibility* filtering happens
 * later, per actor, in F21), and it changes only when an administrator edits the
 * board. Caching it removes one query from every request on the site.
 *
 * A decorator rather than caching inside `PostgresForumRepository` because the
 * cache is a policy, not a persistence detail: the fixture repository should get
 * the same behaviour, and a test needs to be able to drop the layer entirely.
 *
 * **Invariant 9 holds here by construction**: nothing in a `ForumRow` depends on
 * who is asking. The moment a caller wants a viewer-filtered tree, it must
 * filter the cached global result per request — never cache the filtered one.
 */
import { CacheTags, cachedGlobal, type CacheDriver } from '@meith/core'

import type { ForumRepository } from './ports'
import type {
  ForumListingRow,
  ForumRow,
  MovePlan,
  MoveTarget,
  NewForum,
} from './types'

/** One key, one tag: the tree is read and invalidated as a single unit. */
const TREE_KEY = ['forum-tree'] as const

export class CachedForumRepository implements ForumRepository {
  constructor(
    private readonly inner: ForumRepository,
    private readonly cache: CacheDriver,
  ) {}

  async listAll(): Promise<ForumRow[]> {
    return cachedGlobal(
      this.cache,
      { key: TREE_KEY, tags: [CacheTags.forumTree()] },
      () => this.inner.listAll(),
    )
  }

  /**
   * **Deliberately not cached, and this class is where that decision is
   * enforced.**
   *
   * The counters and last-post columns change on every post. Caching them under
   * the forum-tree tag would mean invalidating the tree on every reply, which
   * makes the tag worthless for the structural read it exists to serve — and
   * caching them under a tag of their own means a cache entry that is stale
   * within seconds and a second thing to remember to invalidate from the posting
   * path.
   *
   * A decorator that silently *added* caching here would be the worst outcome:
   * a board index showing yesterday's reply counts, with nothing to point at.
   */
  async listListing(): Promise<ForumListingRow[]> {
    return this.inner.listListing()
  }

  /**
   * Served from the cached tree rather than its own query.
   *
   * The whole forest is tens of rows and already in memory, so a per-id round
   * trip would buy nothing — and routing both reads through one cache entry
   * means there is a single thing to invalidate. Two entries with separate
   * lifetimes is how a stale `findById` outlives a fresh `listAll`.
   */
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

  /**
   * Invalidation is *after* the write, never before: clearing first opens a
   * window where a concurrent read repopulates the cache from the pre-write
   * state and then nothing clears it again.
   *
   * Any future mutation — create, delete, rename, permission edit that changes a
   * displayed flag — must call this too. That is the cost of a cache, and the
   * reason every writer goes through this class rather than the inner repository.
   */
  private async invalidate(): Promise<void> {
    await this.cache.invalidateTags([CacheTags.forumTree()])
  }
}
