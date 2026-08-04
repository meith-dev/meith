/**
 * F85 — the MySQL reader, and the one part of the importer that needed a human.
 *
 * ## What this file is, and how small it deliberately is
 *
 * It is one more implementation of `MybbSource`, and the reason it is short is
 * the whole point of that port: **every hard decision in an import is on the
 * other side of it.** The mapping, the ordering, the chunking, the resumability,
 * the idempotency and the counter comparison are all in `map.ts` and `run.ts`,
 * tested against `FixtureMybbSource`, and none of them changed to accommodate
 * this. A reader is `SELECT … WHERE id > ? ORDER BY id LIMIT ?`, and it should
 * stay boring enough to read in one sitting.
 *
 * The dependency (`mysql2`) was open question 5 and is now decided. See
 * `docs/adr/0004-mysql2-import-reader.md`.
 *
 * ## Loaded lazily, and that is load-bearing
 *
 * `mysql2` is imported inside `connect()` rather than at module scope, so
 * importing `@meith/import` — which the app does, for F86's URL table — does not
 * pull a MySQL driver into the bundle. On a serverless deployment that is the
 * difference between a dependency the importer has and a dependency every
 * request pays for.
 *
 * ## Read-only, by construction and by intent
 *
 * The source board is somebody's live forum. Every statement here is a `SELECT`,
 * the connection is opened read-only where the server allows it, and there is no
 * code path in this file that writes. An importer that could modify the board it
 * is reading is one nobody should run against production — and "we were careful"
 * is not the same guarantee as "there is no write in the file".
 */

import type { MybbForum, MybbPost, MybbSource, MybbThread, MybbUser, Page } from './source'

/** Enough to reach a MyBB database. Everything else has a sensible default. */
export interface MysqlSourceOptions {
  readonly host: string
  readonly port?: number | undefined
  readonly user: string
  readonly password: string
  readonly database: string
  /**
   * MyBB's table prefix, `mybb_` out of the box and frequently something else —
   * the installer offers to change it, and boards that once shared a database
   * with another application usually did.
   */
  readonly tablePrefix?: string | undefined
  /**
   * MyBB predates `utf8mb4` and most old boards are `latin1` or `utf8`. The
   * connection charset has to match what the board actually stores, or every
   * accented character arrives mojibaked — and it arrives *silently*, which is
   * how an import gets discovered to be wrong a week later.
   */
  readonly charset?: string | undefined
  readonly ssl?: boolean | undefined
}

/*
 * A prefix is interpolated into SQL, so it can never come from anywhere but an
 * operator's own configuration — and even then it is validated rather than
 * trusted. MyBB's installer restricts prefixes to this shape anyway; anything
 * else is either a typo or someone testing whether this string reaches the
 * parser.
 */
const PREFIX_PATTERN = /^[A-Za-z0-9_]{0,32}$/

export function assertSafePrefix(prefix: string): void {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      `Unsafe MyBB table prefix ${JSON.stringify(prefix)}. ` +
        'Letters, digits and underscores only — a prefix becomes part of a table name, ' +
        'and a table name cannot be a bound parameter.',
    )
  }
}

/** The minimum of `mysql2` this file uses, so the import can stay dynamic. */
interface Queryable {
  query(sql: string, values: readonly unknown[]): Promise<[unknown, unknown]>
  end(): Promise<void>
}

/**
 * Read a live MyBB board.
 *
 * Not constructed directly — `connect()` is async because opening the
 * connection is, and a constructor that returned an object whose connection was
 * still being established would make every method's first call a race.
 */
export class MysqlMybbSource implements MybbSource {
  private constructor(
    private readonly connection: Queryable,
    private readonly prefix: string,
  ) {}

  static async connect(options: MysqlSourceOptions): Promise<MysqlMybbSource> {
    const prefix = options.tablePrefix ?? 'mybb_'
    assertSafePrefix(prefix)

    /* Dynamic, so `@meith/import` stays importable without a MySQL driver. */
    const mysql = await import('mysql2/promise')

    const connection = await mysql.createConnection({
      host: options.host,
      port: options.port ?? 3306,
      user: options.user,
      password: options.password,
      database: options.database,
      charset: options.charset ?? 'utf8mb4',
      ...(options.ssl === true ? { ssl: {} } : {}),
      /*
       * Numbers as numbers. `mysql2` returns `BIGINT` and `DECIMAL` as strings
       * by default to avoid precision loss, which is right in general and wrong
       * here: every id this reader touches is a MyBB `int`, and a string id
       * would compare wrongly in the keyset cursor — `'100' > '99'` is false.
       */
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: false,
    })

    return new MysqlMybbSource(connection as unknown as Queryable, prefix)
  }

  async close(): Promise<void> {
    await this.connection.end()
  }

  users(afterId: number, limit: number): Promise<Page<MybbUser>> {
    return this.#page<MybbUser>(
      `select uid, username, email, password, salt, usergroup,
              regdate, lastvisit, postnum
         from \`${this.prefix}users\``,
      'uid',
      (row) => row.uid,
      afterId,
      limit,
    )
  }

  forums(afterId: number, limit: number): Promise<Page<MybbForum>> {
    return this.#page<MybbForum>(
      `select fid, name, description, type, pid, disporder, linkto, threads, posts
         from \`${this.prefix}forums\``,
      'fid',
      (row) => row.fid,
      afterId,
      limit,
    )
  }

  threads(afterId: number, limit: number): Promise<Page<MybbThread>> {
    return this.#page<MybbThread>(
      `select tid, fid, subject, uid, username, dateline, lastpost,
              replies, views, sticky, closed, visible
         from \`${this.prefix}threads\``,
      'tid',
      (row) => row.tid,
      afterId,
      limit,
    )
  }

  posts(afterId: number, limit: number): Promise<Page<MybbPost>> {
    return this.#page<MybbPost>(
      `select pid, tid, fid, uid, username, subject, message,
              dateline, edituid, edittime, visible
         from \`${this.prefix}posts\``,
      'pid',
      (row) => row.pid,
      afterId,
      limit,
    )
  }

  /**
   * One keyset page.
   *
   * `> ?` and `order by <key>`, never `OFFSET`: the board being imported is
   * usually still being posted to, and an `OFFSET` walk over a growing table
   * skips rows — silently, and in the middle, which is the worst place for an
   * import to lose something.
   *
   * The key column is a literal because a column name cannot be a bound
   * parameter, and it is a literal *this file wrote* rather than anything a
   * caller supplied. Only the prefix crosses that line, and it is validated.
   */
  async #page<T>(
    select: string,
    keyColumn: 'uid' | 'fid' | 'tid' | 'pid',
    idOf: (row: T) => number,
    afterId: number,
    limit: number,
  ): Promise<Page<T>> {
    const [result] = await this.connection.query(
      `${select} where ${keyColumn} > ? order by ${keyColumn} asc limit ?`,
      [afterId, limit],
    )

    const rows = (Array.isArray(result) ? result : []) as T[]

    /*
     * Null on a *short* page, not an empty one — the same rule the fixture
     * source follows, and the reason both are testable against the same runner.
     * A full page that happens to be the last still returns a cursor and costs
     * one extra query; the alternative is a source that has to know its own
     * total, which a live database being written to does not.
     */
    const last = rows.at(-1)
    return { rows, nextCursor: rows.length < limit || last === undefined ? null : idOf(last) }
  }
}
