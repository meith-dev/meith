import { describe, expect, it } from 'vitest'

import {
  FixtureMybbSource,
  KINDS,
  NO_PROGRESS,
  compareCounters,
  fromUnixSeconds,
  mapForum,
  mapPost,
  mapThread,
  mapUser,
  runImport,
  visibilityOf,
  type ImportSink,
  type MybbPost,
  type MybbThread,
  type WriteResult,
} from './index'

class MemorySink implements ImportSink {
  readonly stored = new Map<string, Map<number, unknown>>()
  readonly calls: string[] = []

  putUsers = (rows: readonly { legacyId: number }[]) => this.#put('users', rows)
  putForums = (rows: readonly { legacyId: number }[]) => this.#put('forums', rows)
  putThreads = (rows: readonly { legacyId: number }[]) => this.#put('threads', rows)
  putPosts = (rows: readonly { legacyId: number }[]) => this.#put('posts', rows)

  count(kind: string): number {
    return this.stored.get(kind)?.size ?? 0
  }

  async #put(kind: string, rows: readonly { legacyId: number }[]): Promise<WriteResult> {
    this.calls.push(`${kind}:${rows.length}`)
    const table = this.stored.get(kind) ?? new Map<number, unknown>()
    this.stored.set(kind, table)

    let inserted = 0
    let updated = 0
    for (const row of rows) {
      if (table.has(row.legacyId)) updated += 1
      else inserted += 1
      table.set(row.legacyId, row)
    }
    return { inserted, updated, skipped: [] }
  }
}

const user = (uid: number) => ({
  uid,
  username: `member${uid}`,
  email: `Member${uid}@Example.TEST`,
  password: 'a'.repeat(32),
  salt: 'saltsalt',
  usergroup: 2,
  regdate: 1_600_000_000,
  lastvisit: 1_700_000_000,
  postnum: 10,
})

const thread = (tid: number, overrides: Partial<MybbThread> = {}): MybbThread => ({
  tid,
  fid: 2,
  subject: `Thread ${tid}`,
  uid: 1,
  username: 'member1',
  dateline: 1_600_000_000,
  lastpost: 1_700_000_000,
  replies: 1,
  views: 40,
  sticky: 0,
  closed: '0',
  visible: 1,
  ...overrides,
})

const post = (pid: number, overrides: Partial<MybbPost> = {}): MybbPost => ({
  pid,
  tid: 1,
  fid: 2,
  uid: 1,
  username: 'member1',
  subject: 'Re: Thread 1',
  message: 'Hello.',
  dateline: 1_600_000_000,
  edituid: 0,
  edittime: 0,
  visible: 1,
  ...overrides,
})

const BOARD = {
  users: [user(1), user(2), user(3)],
  forums: [
    { fid: 1, name: 'Forum', description: '', type: 'c', pid: 0, disporder: 1, linkto: '', threads: 0, posts: 0 },
    { fid: 2, name: 'General', description: 'Chat', type: 'f', pid: 1, disporder: 1, linkto: '', threads: 2, posts: 3 },
    { fid: 3, name: 'Our wiki', description: '', type: 'l', pid: 1, disporder: 2, linkto: 'https://wiki.test', threads: 0, posts: 0 },
  ],
  threads: [thread(1), thread(2, { replies: 0 })],
  posts: [post(1), post(2, { pid: 2 }), post(3, { pid: 3, tid: 2 })],
}

describe('timestamps', () => {
  it('reads MyBB seconds', () => {
    expect(fromUnixSeconds(1_600_000_000)?.toISOString()).toBe('2020-09-13T12:26:40.000Z')
  })

  it('reads 0 and negatives as never', () => {
    expect(fromUnixSeconds(0)).toBeNull()
    expect(fromUnixSeconds(-1)).toBeNull()
    expect(fromUnixSeconds(Number.NaN)).toBeNull()
  })
})

describe('visibility', () => {
  it('maps MyBB’s three states', () => {
    expect(visibilityOf(1)).toBe('visible')
    expect(visibilityOf(0)).toBe('unapproved')
    expect(visibilityOf(-1)).toBe('deleted')
  })

  it('treats an unknown value as unapproved rather than visible', () => {
    expect(visibilityOf(2)).toBe('unapproved')
    expect(visibilityOf(-99)).toBe('unapproved')
  })
})

describe('users', () => {
  const mapped = mapUser(user(7))

  it('keeps the legacy hash in a form that can be verified', () => {
    expect(mapped.legacyPasswordHash).toBe(`mybb$saltsalt$${'a'.repeat(32)}`)
  })

  it('lower-cases the e-mail', () => {
    expect(mapped.email).toBe('member7@example.test')
  })

  it('carries the post count without trusting it', () => {
    expect(mapUser({ ...user(7), postnum: -5 }).postCount).toBe(0)
  })

  it('reads a never-visited account as null rather than the epoch', () => {
    expect(mapUser({ ...user(7), lastvisit: 0 }).lastVisitAt).toBeNull()
  })
})

describe('forums', () => {
  it('maps the three MyBB types', () => {
    expect(mapForum(BOARD.forums[0]!).type).toBe('category')
    expect(mapForum(BOARD.forums[1]!).type).toBe('forum')
    expect(mapForum(BOARD.forums[2]!).type).toBe('link')
  })

  it('reads an unknown type as a forum', () => {
    expect(mapForum({ ...BOARD.forums[1]!, type: 'x' }).type).toBe('forum')
  })

  it('turns MyBB’s parent 0 into null', () => {
    expect(mapForum(BOARD.forums[0]!).legacyParentId).toBeNull()
    expect(mapForum(BOARD.forums[1]!).legacyParentId).toBe(1)
  })

  it('keeps a link URL only for a link', () => {
    expect(mapForum(BOARD.forums[2]!).linkUrl).toBe('https://wiki.test')
    expect(mapForum({ ...BOARD.forums[1]!, linkto: 'https://x.test' }).linkUrl).toBeNull()
  })
})

describe('threads', () => {
  it('reads closed as the string MyBB stores', () => {
    expect(mapThread(thread(1, { closed: '1' })).isLocked).toBe(true)
    expect(mapThread(thread(1, { closed: '0' })).isLocked).toBe(false)
  })

  it('keeps the denormalised author name, for a deleted account', () => {
    expect(mapThread(thread(1, { uid: 0, username: 'Ghost' })).authorUsername).toBe('Ghost')
  })

  it('falls back to its own creation when lastpost is corrupt', () => {
    const mapped = mapThread(thread(1, { lastpost: 0 }))
    expect(mapped.lastPostAt).toEqual(mapped.createdAt)
  })
})

describe('posts', () => {
  it('reads an unedited post as never edited', () => {
    expect(mapPost(post(1)).editedAt).toBeNull()
  })

  it('reads an edited post’s time', () => {
    expect(mapPost(post(1, { edituid: 4, edittime: 1_700_000_000 })).editedAt).not.toBeNull()
  })
})

describe('the fixture round trip', () => {
  it('imports every row', async () => {
    const sink = new MemorySink()
    const report = await runImport({ source: new FixtureMybbSource(BOARD), sink })

    expect(report.finished).toBe(true)
    expect(sink.count('users')).toBe(3)
    expect(sink.count('forums')).toBe(3)
    expect(sink.count('threads')).toBe(2)
    expect(sink.count('posts')).toBe(3)
  })

  it('reports what it did, per kind', async () => {
    const sink = new MemorySink()
    const report = await runImport({ source: new FixtureMybbSource(BOARD), sink })

    expect(report.kinds.users).toMatchObject({ read: 3, inserted: 3, updated: 0 })
    expect(report.kinds.posts).toMatchObject({ read: 3, inserted: 3, updated: 0 })
    expect(report.readThisRun).toBe(11)
  })

  it('imports twice without duplicating anything', async () => {
    const sink = new MemorySink()
    const source = new FixtureMybbSource(BOARD)

    await runImport({ source, sink })
    const second = await runImport({ source, sink })

    expect(sink.count('posts')).toBe(3)
    expect(second.kinds.posts).toMatchObject({ inserted: 0, updated: 3 })
  })

  it('reads in pages of the size it was given', async () => {
    const sink = new MemorySink()
    await runImport({ source: new FixtureMybbSource(BOARD), sink, pageSize: 1 })

    expect(sink.calls.filter((call) => call.startsWith('posts:'))).toEqual([
      'posts:1',
      'posts:1',
      'posts:1',
    ])
  })

  it('stops at the budget and resumes exactly where it stopped', async () => {
    const sink = new MemorySink()
    const source = new FixtureMybbSource(BOARD)

    const first = await runImport({ source, sink, pageSize: 2, budget: 4 })
    expect(first.finished).toBe(false)
    expect(first.readThisRun).toBe(4)

    const second = await runImport({ source, sink, pageSize: 2, budget: 100, from: first.cursors })
    expect(second.finished).toBe(true)

    expect(sink.count('users')).toBe(3)
    expect(sink.count('posts')).toBe(3)
    const inserts =
      first.kinds.users.inserted +
      first.kinds.posts.inserted +
      second.kinds.users.inserted +
      second.kinds.posts.inserted
    expect(inserts).toBe(6)
  })

  it('resumes from nothing when given no cursors', async () => {
    const sink = new MemorySink()
    const report = await runImport({ source: new FixtureMybbSource(BOARD), sink, from: NO_PROGRESS })
    expect(report.finished).toBe(true)
  })

  it('imports in dependency order', async () => {
    const sink = new MemorySink()
    await runImport({ source: new FixtureMybbSource(BOARD), sink })

    const kinds = sink.calls.map((call) => call.split(':')[0])
    expect(kinds.indexOf('users')).toBeLessThan(kinds.indexOf('forums'))
    expect(kinds.indexOf('forums')).toBeLessThan(kinds.indexOf('threads'))
    expect(kinds.indexOf('threads')).toBeLessThan(kinds.indexOf('posts'))
  })

  it('handles an empty board without claiming it did work', async () => {
    const sink = new MemorySink()
    const report = await runImport({ source: new FixtureMybbSource({}), sink })

    expect(report.finished).toBe(true)
    expect(report.readThisRun).toBe(0)
    for (const kind of KINDS) expect(report.kinds[kind].read).toBe(0)
  })
})

describe('the counter comparison', () => {
  const forums = BOARD.forums.map(mapForum)
  const threads = BOARD.threads.map(mapThread)
  const posts = BOARD.posts.map(mapPost)

  it('reports nothing when MyBB’s counters agree with its content', () => {
    expect(
      compareCounters({
        forums,
        threads,
        posts,
        claimedForumTotals: { 2: { threads: 2, posts: 3 } },
      }),
    ).toEqual([])
  })

  it('names a forum whose claimed totals are wrong', () => {
    const differences = compareCounters({
      forums,
      threads,
      posts,
      claimedForumTotals: { 2: { threads: 9, posts: 3 } },
    })

    expect(differences).toEqual([{ legacyId: 2, field: 'threads', claimed: 9, actual: 2 }])
  })

  it('does not count deleted or unapproved content', () => {
    const withHidden = [...posts, mapPost(post(4, { pid: 4, visible: -1 }))]
    expect(
      compareCounters({
        forums,
        threads,
        posts: withHidden,
        claimedForumTotals: { 2: { threads: 2, posts: 3 } },
      }),
    ).toEqual([])
  })

  it('names a thread whose reply count is wrong', () => {
    const differences = compareCounters({
      forums,
      threads: [mapThread(thread(1, { replies: 7 }))],
      posts,
      claimedForumTotals: {},
    })

    expect(differences).toEqual([{ legacyId: 1, field: 'replies', claimed: 7, actual: 1 }])
  })

  it('says nothing about a forum MyBB gave no totals for', () => {
    expect(compareCounters({ forums, threads, posts, claimedForumTotals: {} })).toEqual([])
  })
})
