import type { MybbForum, MybbPost, MybbSource, MybbThread, MybbUser, Page } from './source'

export interface MysqlSourceOptions {
  readonly host: string
  readonly port?: number | undefined
  readonly user: string
  readonly password: string
  readonly database: string
  readonly tablePrefix?: string | undefined
  readonly charset?: string | undefined
  readonly ssl?: boolean | undefined
}

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

interface Queryable {
  query(sql: string, values: readonly unknown[]): Promise<[unknown, unknown]>
  end(): Promise<void>
}

export class MysqlMybbSource implements MybbSource {
  private constructor(
    private readonly connection: Queryable,
    private readonly prefix: string,
  ) {}

  static async connect(options: MysqlSourceOptions): Promise<MysqlMybbSource> {
    const prefix = options.tablePrefix ?? 'mybb_'
    assertSafePrefix(prefix)

    const mysql = await import('mysql2/promise')

    const connection = await mysql.createConnection({
      host: options.host,
      port: options.port ?? 3306,
      user: options.user,
      password: options.password,
      database: options.database,
      charset: options.charset ?? 'utf8mb4',
      ...(options.ssl === true ? { ssl: {} } : {}),
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

    const last = rows.at(-1)
    return { rows, nextCursor: rows.length < limit || last === undefined ? null : idOf(last) }
  }
}
