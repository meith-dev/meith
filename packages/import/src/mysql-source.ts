import {
  mapAttachment,
  mapAvatar,
  mapBan,
  mapForum,
  mapForumSubscription,
  mapPoll,
  mapPollVote,
  mapPost,
  mapPrivateMessage,
  mapRelationList,
  mapReputation,
  mapThread,
  mapThreadSubscription,
  mapUser,
  mapWarning,
} from './map'
import type {
  MybbAttachment,
  MybbAvatarRow,
  MybbBan,
  MybbForum,
  MybbForumSubscription,
  MybbPoll,
  MybbPollVote,
  MybbPost,
  MybbPrivateMessage,
  MybbRelationList,
  MybbReputation,
  MybbThread,
  MybbThreadSubscription,
  MybbUser,
  MybbWarning,
} from './mybb-rows'
import { type ImportSource, type Page, pageByGroup } from './source'
import type {
  ImportedAttachment,
  ImportedAvatar,
  ImportedBan,
  ImportedForum,
  ImportedPoll,
  ImportedPollVote,
  ImportedPost,
  ImportedPrivateMessage,
  ImportedReputation,
  ImportedSubscription,
  ImportedThread,
  ImportedUser,
  ImportedUserRelation,
  ImportedWarning,
} from './types'

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
      `Unsafe legacy table prefix ${JSON.stringify(prefix)}. ` +
        'Letters, digits and underscores only — a prefix becomes part of a table name, ' +
        'and a table name cannot be a bound parameter.',
    )
  }
}

export interface Queryable {
  query(sql: string, values: readonly unknown[]): Promise<[unknown, unknown]>
  end(): Promise<void>
}

export async function connectMysql(options: MysqlSourceOptions): Promise<Queryable> {
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

  return connection as unknown as Queryable
}

export async function selectRows<T>(
  connection: Queryable,
  sql: string,
  values: readonly unknown[],
): Promise<readonly T[]> {
  const [result] = await connection.query(sql, values)
  return (Array.isArray(result) ? result : []) as T[]
}

export async function keysetPage<T>(
  connection: Queryable,
  select: string,
  keyColumn: string,
  idOf: (row: T) => number,
  afterId: number,
  limit: number,
): Promise<Page<T>> {
  const rows = await selectRows<T>(
    connection,
    `${select} where ${keyColumn} > ? order by ${keyColumn} asc limit ?`,
    [afterId, limit],
  )

  const last = rows.at(-1)
  return { rows, nextCursor: rows.length < limit || last === undefined ? null : idOf(last) }
}

export function mapPage<Raw, Mapped>(
  page: Page<Raw>,
  map: (row: Raw) => Mapped | null,
): Page<Mapped> {
  return {
    rows: page.rows.map(map).filter((row): row is NonNullable<Mapped> => row !== null),
    nextCursor: page.nextCursor,
  }
}

export class MysqlMybbSource implements ImportSource {
  readonly name = 'mybb'

  private constructor(
    private readonly connection: Queryable,
    private readonly prefix: string,
  ) {}

  static async connect(options: MysqlSourceOptions): Promise<MysqlMybbSource> {
    const prefix = options.tablePrefix ?? 'mybb_'
    assertSafePrefix(prefix)
    return new MysqlMybbSource(await connectMysql(options), prefix)
  }

  async close(): Promise<void> {
    await this.connection.end()
  }

  async users(afterId: number, limit: number): Promise<Page<ImportedUser>> {
    return mapPage(
      await this.#page<MybbUser>(
        `select uid, username, email, password, salt, usergroup,
                regdate, lastvisit, postnum
           from \`${this.prefix}users\``,
        'uid',
        (row) => row.uid,
        afterId,
        limit,
      ),
      mapUser,
    )
  }

  async forums(afterId: number, limit: number): Promise<Page<ImportedForum>> {
    return mapPage(
      await this.#page<MybbForum>(
        `select fid, name, description, type, pid, disporder, linkto, threads, posts
           from \`${this.prefix}forums\``,
        'fid',
        (row) => row.fid,
        afterId,
        limit,
      ),
      mapForum,
    )
  }

  async threads(afterId: number, limit: number): Promise<Page<ImportedThread>> {
    return mapPage(
      await this.#page<MybbThread>(
        `select tid, fid, subject, uid, username, dateline, lastpost,
                replies, views, sticky, closed, visible
           from \`${this.prefix}threads\``,
        'tid',
        (row) => row.tid,
        afterId,
        limit,
      ),
      mapThread,
    )
  }

  async posts(afterId: number, limit: number): Promise<Page<ImportedPost>> {
    return mapPage(
      await this.#page<MybbPost>(
        `select pid, tid, fid, uid, username, subject, message,
                dateline, edituid, edittime, visible
           from \`${this.prefix}posts\``,
        'pid',
        (row) => row.pid,
        afterId,
        limit,
      ),
      mapPost,
    )
  }

  async avatars(afterId: number, limit: number): Promise<Page<ImportedAvatar>> {
    const rows = await selectRows<MybbAvatarRow>(
      this.connection,
      `select uid, avatar, avatartype, avatardimensions
         from \`${this.prefix}users\`
        where uid > ? and avatar <> ''
        order by uid asc limit ?`,
      [afterId, limit],
    )
    const last = rows.at(-1)
    return mapPage(
      { rows, nextCursor: rows.length < limit || last === undefined ? null : last.uid },
      mapAvatar,
    )
  }

  async attachments(afterId: number, limit: number): Promise<Page<ImportedAttachment>> {
    return mapPage(
      await this.#page<MybbAttachment>(
        `select aid, pid, uid, filename, filetype, filesize, attachname,
                thumbnail, downloads, dateuploaded
           from \`${this.prefix}attachments\``,
        'aid',
        (row) => row.aid,
        afterId,
        limit,
      ),
      mapAttachment,
    )
  }

  async polls(afterId: number, limit: number): Promise<Page<ImportedPoll>> {
    return mapPage(
      await this.#page<MybbPoll>(
        `select pid, tid, question, dateline, options, votes, timeout, multiple, public
           from \`${this.prefix}polls\``,
        'pid',
        (row) => row.pid,
        afterId,
        limit,
      ),
      mapPoll,
    )
  }

  async pollVotes(afterId: number, limit: number): Promise<Page<ImportedPollVote>> {
    return mapPage(
      await this.#page<MybbPollVote>(
        `select vid, pid, uid, voteoption, dateline
           from \`${this.prefix}pollvotes\``,
        'vid',
        (row) => row.vid,
        afterId,
        limit,
      ),
      mapPollVote,
    )
  }

  async privateMessages(afterId: number, limit: number): Promise<Page<ImportedPrivateMessage>> {
    return mapPage(
      await this.#page<MybbPrivateMessage>(
        `select pmid, uid, fromid, subject, message, dateline, folder, status, readtime
           from \`${this.prefix}privatemessages\``,
        'pmid',
        (row) => row.pmid,
        afterId,
        limit,
      ),
      mapPrivateMessage,
    )
  }

  async threadSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>> {
    return mapPage(
      await this.#page<MybbThreadSubscription>(
        `select sid, uid, tid, notification
           from \`${this.prefix}threadsubscriptions\``,
        'sid',
        (row) => row.sid,
        afterId,
        limit,
      ),
      mapThreadSubscription,
    )
  }

  async forumSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>> {
    const table = `\`${this.prefix}forumsubscriptions\``
    const page = await pageByGroup<MybbForumSubscription>({
      afterGroup: afterId,
      limit,
      groupOf: (row) => row.uid,
      fetch: (afterGroup, take) =>
        selectRows(
          this.connection,
          `select fid, uid from ${table} where uid > ? order by uid asc, fid asc limit ?`,
          [afterGroup, take],
        ),
      fetchGroup: (group) =>
        selectRows(
          this.connection,
          `select fid, uid from ${table} where uid = ? order by fid asc`,
          [group],
        ),
    })
    return mapPage(page, mapForumSubscription)
  }

  async reputation(afterId: number, limit: number): Promise<Page<ImportedReputation>> {
    return mapPage(
      await this.#page<MybbReputation>(
        `select rid, uid, adduid, pid, reputation, dateline, comments
           from \`${this.prefix}reputation\``,
        'rid',
        (row) => row.rid,
        afterId,
        limit,
      ),
      mapReputation,
    )
  }

  async warnings(afterId: number, limit: number): Promise<Page<ImportedWarning>> {
    return mapPage(
      await this.#page<MybbWarning>(
        `select wid, uid, pid, title, points, dateline, issuedby,
                expires, daterevoked, revokereason, notes
           from \`${this.prefix}warnings\``,
        'wid',
        (row) => row.wid,
        afterId,
        limit,
      ),
      mapWarning,
    )
  }

  async bans(afterId: number, limit: number): Promise<Page<ImportedBan>> {
    return mapPage(
      await this.#page<MybbBan>(
        `select uid, admin, dateline, lifted, reason
           from \`${this.prefix}banned\``,
        'uid',
        (row) => row.uid,
        afterId,
        limit,
      ),
      mapBan,
    )
  }

  async userRelations(afterId: number, limit: number): Promise<Page<ImportedUserRelation>> {
    const rows = await selectRows<MybbRelationList>(
      this.connection,
      `select uid, buddylist, ignorelist
         from \`${this.prefix}users\`
        where uid > ? and (buddylist <> '' or ignorelist <> '')
        order by uid asc limit ?`,
      [afterId, limit],
    )
    const last = rows.at(-1)
    return {
      rows: rows.flatMap(mapRelationList),
      nextCursor: rows.length < limit || last === undefined ? null : last.uid,
    }
  }

  #page<T>(
    select: string,
    keyColumn: string,
    idOf: (row: T) => number,
    afterId: number,
    limit: number,
  ): Promise<Page<T>> {
    return keysetPage(this.connection, select, keyColumn, idOf, afterId, limit)
  }
}
