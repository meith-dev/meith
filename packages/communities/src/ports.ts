/**
 * The repository seam (R2: domain packages declare interfaces, `@meith/db`
 * implements them and is the only package that opens a connection).
 */
import type { CommunityListingRow, CommunityRow, MovePlan, MoveTarget, NewCommunity } from './types'

export interface CommunityRepository {
  /**
   * Every community, unordered. **One query regardless of depth** — F16's stated
   * acceptance criterion. Ordering and nesting are `buildTree`'s job, so the
   * caller can cache this flat list and shape it per request.
   */
  listAll(): Promise<CommunityRow[]>

  /**
   * Every community *with its counters and last post* — the board index read (F29).
   * Also one query regardless of depth.
   *
   * ## Why this is not just a wider `listAll`
   *
   * `listAll` is cached under `CacheTags.communityTree()` and invalidated when an
   * administrator edits the board, which is rare. These columns change on **every
   * post**. Folding them into the cached read would mean invalidating the community
   * tree on every reply, which is a cache that costs more than it saves and, worse,
   * makes the tag meaningless: nothing else could rely on it either.
   *
   * So structure is cached and volatile counters are not, and a caller picks the
   * read that matches what it needs. The board index needs both and asks for this
   * one, paying a query for data that is stale the moment it is cached anyway.
   */
  listListing(): Promise<CommunityListingRow[]>

  findById(id: number): Promise<CommunityRow | null>

  /**
   * Create a community, deriving `path` from the parent inside the same
   * transaction that assigns the id. Returns the created row.
   */
  create(input: NewCommunity): Promise<CommunityRow>

  /**
   * Apply a validated `MovePlan` atomically.
   *
   * Every path rewrite and every sibling renumber lands in one transaction: a
   * half-applied move leaves descendants pointing at a path their parent no
   * longer has, which is corruption no read path can recover from.
   */
  applyMove(plan: MovePlan): Promise<void>

  /** Plan and apply in one step, re-reading the tree inside the transaction. */
  move(communityId: number, target: MoveTarget): Promise<void>
}
