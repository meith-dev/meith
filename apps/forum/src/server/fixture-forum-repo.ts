import 'server-only'

/**
 * The in-memory `ForumRepository` behind `DATA_SOURCE=fixture` (F16/F29).
 *
 * Its whole job is to let the board render with no database: `pnpm dev` on a
 * fresh checkout, and the app-tier tests, which assert what a page *shows* and
 * have no business booting Postgres to do it.
 *
 * Reads are real — same rows, same ordering, same shapes as the Postgres
 * repository, which is what makes a view-model test meaningful. **Writes throw.**
 * A fixture that accepted `create()` would let someone build a board in the
 * dev UI and lose it on restart, and the CLI already refuses fixture mode for the
 * same reason. Same rule as the scheduler in fixture mode (D32): refuse rather
 * than fake.
 */
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

  /*
   * Copies, not the seed array. Handing out the module-level objects would let a
   * caller (or a test) mutate the fixture for every other consumer in the
   * process — the in-memory equivalent of a test writing to production.
   */
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

  /** Matches the Postgres repository's `ORDER BY display_order, id`. */
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
