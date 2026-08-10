import type { ForumListingRow, ForumRow, MovePlan, MoveTarget, NewForum } from './types'

export interface ForumRepository {
  listAll(): Promise<ForumRow[]>

  listListing(): Promise<ForumListingRow[]>

  findById(id: number): Promise<ForumRow | null>

  create(input: NewForum): Promise<ForumRow>

  applyMove(plan: MovePlan): Promise<void>

  move(forumId: number, target: MoveTarget): Promise<void>
}
