export interface MybbUser {
  readonly uid: number
  readonly username: string
  readonly email: string
  readonly password: string
  readonly salt: string
  readonly usergroup: number
  readonly regdate: number
  readonly lastvisit: number
  readonly postnum: number
}

export interface MybbForum {
  readonly fid: number
  readonly name: string
  readonly description: string
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

export interface Page<T> {
  readonly rows: readonly T[]
  readonly nextCursor: number | null
}

export interface MybbSource {
  users(afterId: number, limit: number): Promise<Page<MybbUser>>
  forums(afterId: number, limit: number): Promise<Page<MybbForum>>
  threads(afterId: number, limit: number): Promise<Page<MybbThread>>
  posts(afterId: number, limit: number): Promise<Page<MybbPost>>
}

export class FixtureMybbSource implements MybbSource {
  constructor(
    private readonly data: {
      readonly users?: readonly MybbUser[]
      readonly forums?: readonly MybbForum[]
      readonly threads?: readonly MybbThread[]
      readonly posts?: readonly MybbPost[]
    },
  ) {}

  users(afterId: number, limit: number): Promise<Page<MybbUser>> {
    return this.#page(this.data.users ?? [], (row) => row.uid, afterId, limit)
  }

  forums(afterId: number, limit: number): Promise<Page<MybbForum>> {
    return this.#page(this.data.forums ?? [], (row) => row.fid, afterId, limit)
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

    const last = rows.at(-1)
    return { rows, nextCursor: rows.length < limit || last === undefined ? null : idOf(last) }
  }
}
