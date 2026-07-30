/**
 * The repository seam (R2: domain packages declare interfaces, `@forum/db`
 * implements them and is the only package that opens a connection).
 */
import type { ForumRow, MovePlan, MoveTarget, NewForum } from './types'

export interface ForumRepository {
  /**
   * Every forum, unordered. **One query regardless of depth** — F16's stated
   * acceptance criterion. Ordering and nesting are `buildTree`'s job, so the
   * caller can cache this flat list and shape it per request.
   */
  listAll(): Promise<ForumRow[]>

  findById(id: number): Promise<ForumRow | null>

  /**
   * Create a forum, deriving `path` from the parent inside the same
   * transaction that assigns the id. Returns the created row.
   */
  create(input: NewForum): Promise<ForumRow>

  /**
   * Apply a validated `MovePlan` atomically.
   *
   * Every path rewrite and every sibling renumber lands in one transaction: a
   * half-applied move leaves descendants pointing at a path their parent no
   * longer has, which is corruption no read path can recover from.
   */
  applyMove(plan: MovePlan): Promise<void>

  /** Plan and apply in one step, re-reading the tree inside the transaction. */
  move(forumId: number, target: MoveTarget): Promise<void>
}
