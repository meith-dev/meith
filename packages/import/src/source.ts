/**
 * F85 — where MyBB rows come from, as a port.
 *
 * ## The dependency this feature deliberately does not add
 *
 * Reading a live MyBB board means talking to MySQL, and a MySQL client is a
 * runtime dependency. The roadmap's working rules say to stop for a human before
 * adding one, so this feature ships the **port** and a fixture implementation,
 * and the MySQL reader is one more implementation of an interface that already
 * exists. See the open question in `plan-status.md`.
 *
 * That is not a workaround. Every hard part of an import — the mapping, the
 * ordering, resumability, idempotency, whether the counters come out right — is
 * on this side of the port, and the acceptance criterion asks for a **fixture
 * round trip** precisely because that is where the proof belongs. A reader is
 * `SELECT * FROM mybb_posts LIMIT ? OFFSET ?`.
 *
 * ## Rows are read in pages, keyset by legacy id
 *
 * Not `OFFSET`. A MyBB board being imported is usually still running — people
 * are posting during the migration — and an `OFFSET` walk over a table that is
 * growing skips rows. Keyset on the primary key is stable under insertion, which
 * is also what makes the import resumable: the cursor is a legacy id, and it
 * means the same thing on the next run.
 */

/** MyBB's `mybb_users`, reduced to what an import needs. */
export interface MybbUser {
  readonly uid: number
  readonly username: string
  readonly email: string
  /** MyBB's `md5(md5(salt) + md5(password))`. Carried for F86 to upgrade. */
  readonly password: string
  readonly salt: string
  readonly usergroup: number
  /** Unix seconds. MyBB stores every timestamp this way. */
  readonly regdate: number
  readonly lastvisit: number
  readonly postnum: number
}

export interface MybbCommunity {
  readonly fid: number
  readonly name: string
  readonly description: string
  /** `f` = community, `c` = category, `l` = link. */
  readonly type: string
  readonly pid: number
  readonly disporder: number
  readonly linkto: string
  readonly threads: number
  readonly posts: number
}

export interface MybbThread {
  readonly tid: number
  readonly fid: number
  readonly subject: string
  readonly uid: number
  readonly username: string
  readonly dateline: number
  readonly lastpost: number
  readonly replies: number
  readonly views: number
  readonly sticky: number
  readonly closed: string
  /** 1 visible, 0 awaiting approval, -1 soft-deleted. */
  readonly visible: number
}

export interface MybbPost {
  readonly pid: number
  readonly tid: number
  readonly fid: number
  readonly uid: number
  readonly username: string
  readonly subject: string
  readonly message: string
  readonly dateline: number
  readonly edituid: number
  readonly edittime: number
  readonly visible: number
}

/** One page of rows, with the cursor to continue from. */
export interface Page<T> {
  readonly rows: readonly T[]
  /** The last legacy id in this page, or `null` when the table is exhausted. */
  readonly nextCursor: number | null
}

/**
 * What an import reads from.
 *
 * Every method is `(afterId, limit)` — keyset, ascending, stable. A source that
 * cannot do that cannot be imported resumably, and pretending otherwise would
 * produce an import that silently loses rows on a busy board.
 */
export interface MybbSource {
  users(afterId: number, limit: number): Promise<Page<MybbUser>>
  communities(afterId: number, limit: number): Promise<Page<MybbCommunity>>
  threads(afterId: number, limit: number): Promise<Page<MybbThread>>
  posts(afterId: number, limit: number): Promise<Page<MybbPost>>
}

/**
 * An in-memory source, for the fixture round trip.
 *
 * It pages exactly as a database one must — ascending by id, `> afterId`,
 * bounded by `limit` — so the resumability and chunking logic is exercised for
 * real rather than against a source that hands over everything at once. An
 * importer tested against a single-page source has never had its cursor tested.
 */
export class FixtureMybbSource implements MybbSource {
  constructor(
    private readonly data: {
      readonly users?: readonly MybbUser[]
      readonly communities?: readonly MybbCommunity[]
      readonly threads?: readonly MybbThread[]
      readonly posts?: readonly MybbPost[]
    },
  ) {}

  users(afterId: number, limit: number): Promise<Page<MybbUser>> {
    return this.#page(this.data.users ?? [], (row) => row.uid, afterId, limit)
  }

  communities(afterId: number, limit: number): Promise<Page<MybbCommunity>> {
    return this.#page(this.data.communities ?? [], (row) => row.fid, afterId, limit)
  }

  threads(afterId: number, limit: number): Promise<Page<MybbThread>> {
    return this.#page(this.data.threads ?? [], (row) => row.tid, afterId, limit)
  }

  posts(afterId: number, limit: number): Promise<Page<MybbPost>> {
    return this.#page(this.data.posts ?? [], (row) => row.pid, afterId, limit)
  }

  async #page<T>(
    all: readonly T[],
    idOf: (row: T) => number,
    afterId: number,
    limit: number,
  ): Promise<Page<T>> {
    const rows = [...all]
      .sort((a, b) => idOf(a) - idOf(b))
      .filter((row) => idOf(row) > afterId)
      .slice(0, limit)

    /*
     * `nextCursor` is null on a *short* page, not on an empty one. A full page
     * that happens to be the last one still returns a cursor, and the next call
     * comes back empty — one extra query, and the alternative is a source that
     * has to know its own total, which a live database being written to does not.
     */
    const last = rows.at(-1)
    return { rows, nextCursor: rows.length < limit || last === undefined ? null : idOf(last) }
  }
}
