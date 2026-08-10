import 'server-only'

import { ConfigurationError } from '@meith/core'
import type {
  ForumListingRow,
  ForumRepository,
  ForumRow,
  MovePlan,
  MoveTarget,
  NewForum,
} from '@meith/forums'

import { SEED_FORUM_ROWS } from './seed-board'

function structural(row: ForumListingRow): ForumRow {
  const { threadCount: _t, postCount: _p, lastPost: _l, ...rest } = row
  return rest
}

function unsupported(operation: string): never {
  throw new ConfigurationError(
    `Cannot ${operation} in fixture mode: the board is in-memory sample data and ` +
      'any change is lost when the process exits. Set DATABASE_URL and ' +
      'DATA_SOURCE=postgres to manage a real board.',
  )
}

export class FixtureForumRepository implements ForumRepository {
  constructor(private readonly rows: readonly ForumListingRow[] = SEED_FORUM_ROWS) {}

  async listAll(): Promise<ForumRow[]> {
    return this.ordered().map(structural)
  }

  async listListing(): Promise<ForumListingRow[]> {
    return this.ordered().map((row) => ({ ...row }))
  }

  async findById(id: number): Promise<ForumRow | null> {
    const row = this.rows.find((r) => r.id === id)
    return row ? structural(row) : null
  }

  private ordered(): ForumListingRow[] {
    return [...this.rows].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
    )
  }

  async create(_input: NewForum): Promise<ForumRow> {
    unsupported('create a forum')
  }

  async move(_forumId: number, _target: MoveTarget): Promise<void> {
    unsupported('move a forum')
  }

  async applyMove(_plan: MovePlan): Promise<void> {
    unsupported('move a forum')
  }
}
