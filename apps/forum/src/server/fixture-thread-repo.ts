import "server-only";

import type { ContentScope } from '@forum/core'
import type {
  ThreadCursor,
  ThreadListingRow,
  ThreadPage,
  ThreadRepository,
} from "@forum/threads";

import { SEED_THREAD_ROWS } from "./seed-board";

function compare(a: ThreadListingRow, b: ThreadListingRow): number {
  return (
    Number(b.isSticky) - Number(a.isSticky) ||
    b.lastPostAt.getTime() - a.lastPostAt.getTime() ||
    b.id - a.id
  );
}

function after(row: ThreadListingRow, cursor: ThreadCursor): boolean {
  return (
    Number(row.isSticky) < Number(cursor.isSticky) ||
    (row.isSticky === cursor.isSticky &&
      (row.lastPostAt < cursor.lastPostAt ||
        (row.lastPostAt.getTime() === cursor.lastPostAt.getTime() &&
          row.id < cursor.id)))
  );
}

/** Read-only demo data. Like the forum fixture, it deliberately has no writes. */
export class FixtureThreadRepository implements ThreadRepository {
  constructor(
    private readonly rows: readonly ThreadListingRow[] = SEED_THREAD_ROWS,
  ) {}

  async locateForum(threadId: number): Promise<number | null> {
    return this.rows.find((entry) => entry.id === threadId)?.forumId ?? null
  }

  async findById(id: number, scope: ContentScope): Promise<ThreadListingRow | null> {
    const row = this.rows.find(
      (entry) => entry.id === id && scope.states.includes(entry.visibility),
    )
    return row ? { ...row } : null
  }

  async listForum(
    forumId: number,
    options: {
      readonly after?: ThreadCursor
      readonly limit: number
      readonly scope: ContentScope
    },
  ): Promise<ThreadPage> {
    const matches = this.rows
      .filter(
        (row) =>
          row.forumId === forumId &&
          /* The same predicate the Postgres adapter applies, so a fixture-mode
             leak would be a fixture-mode bug rather than an untested path. */
          options.scope.states.includes(row.visibility) &&
          (!options.after || after(row, options.after)),
      )
      .sort(compare);
    const page = matches.slice(0, options.limit).map((row) => ({ ...row }));
    const last = page.at(-1);

    return {
      rows: page,
      nextCursor:
        matches.length > options.limit && last
          ? {
              isSticky: last.isSticky,
              lastPostAt: last.lastPostAt,
              id: last.id,
            }
          : null,
    };
  }
}
