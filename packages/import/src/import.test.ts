import { describe, expect, it } from 'vitest'

import {
  FixtureMybbSource,
  KINDS,
  NO_PROGRESS,
  compareCounters,
  fromUnixSeconds,
  mapCommunity,
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

/* ------------------------------------------------------------------ *
 * A sink that records, and is idempotent the way a real one must be
 * ------------------------------------------------------------------ */

/**
 * The in-memory sink.
 *
 * Keyed on `(kind, legacyId)` and reporting insert-versus-update, which is
 * exactly the contract a Postgres sink has to honour — so the round trip below
 * proves the runner's idempotency rather than the map's happening to be a no-op.
 */
class MemorySink implements ImportSink {
  readonly stored = new Map<string, Map<number, unknown>>()
  /** Every call, so "was this page written twice" is answerable. */
  readonly calls: string[] = []

  putUsers = (rows: readonly { legacyId: number }[]) => this.#put('users', rows)
  putCommunities = (rows: readonly { legacyId: number }[]) => this.#put('communities', rows)
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

/* ------------------------------------------------------------------ *
 * A small board
 * ------------------------------------------------------------------ */

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
  communities: [
    { fid: 1, name: 'Community', description: '', type: 'c', pid: 0, disporder: 1, linkto: '', threads: 0, posts: 0 },
    { fid: 2, name: 'General', description: 'Chat', type: 'f', pid: 1, disporder: 1, linkto: '', threads: 2, posts: 3 },
    { fid: 3, name: 'Our wiki', description: '', type: 'l', pid: 1, disporder: 2, linkto: 'https://wiki.test', threads: 0, posts: 0 },
  ],
  threads: [thread(1), thread(2, { replies: 0 })],
  posts: [post(1), post(2, { pid: 2 }), post(3, { pid: 3, tid: 2 })],
}

/* ------------------------------------------------------------------ *
 * Mapping
 * ------------------------------------------------------------------ */

describe('timestamps', () => {
  /*
   * Seconds, not milliseconds. Getting it wrong produces dates in 1970 — obvious
   * — or, once somebody "fixes" it the other way, sub-second offsets from the
   * epoch that sort correctly relative to each other. The second one ships.
   */
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

  /*
   * An unknown value comes from a plugin, and the safe reading of "I do not know
   * whether this should be public" is that it should not be. A default of
   * `visible` would publish whatever that plugin was hiding.
   */
  it('treats an unknown value as unapproved rather than visible', () => {
    expect(visibilityOf(2)).toBe('unapproved')
    expect(visibilityOf(-99)).toBe('unapproved')
  })
})

describe('users', () => {
  const mapped = mapUser(user(7))

  it('keeps the legacy hash in a form F86 can verify', () => {
    expect(mapped.legacyPasswordHash).toBe(`mybb$saltsalt$${'a'.repeat(32)}`)
  })

  /* This board's uniqueness is case-insensitive and MyBB's is not. */
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

describe('communities', () => {
  it('maps the three MyBB types', () => {
    expect(mapCommunity(BOARD.communities[0]!).type).toBe('category')
    expect(mapCommunity(BOARD.communities[1]!).type).toBe('community')
    expect(mapCommunity(BOARD.communities[2]!).type).toBe('link')
  })

  /*
   * A fourth type comes from a plugin. A community is the reading that loses
   * nothing — its threads still import, where treating it as a link would orphan
   * them.
   */
  it('reads an unknown type as a community', () => {
    expect(mapCommunity({ ...BOARD.communities[1]!, type: 'x' }).type).toBe('community')
  })

  it('turns MyBB’s parent 0 into null', () => {
    expect(mapCommunity(BOARD.communities[0]!).legacyParentId).toBeNull()
    expect(mapCommunity(BOARD.communities[1]!).legacyParentId).toBe(1)
  })

  it('keeps a link URL only for a link', () => {
    expect(mapCommunity(BOARD.communities[2]!).linkUrl).toBe('https://wiki.test')
    expect(mapCommunity({ ...BOARD.communities[1]!, linkto: 'https://x.test' }).linkUrl).toBeNull()
  })
})

describe('threads', () => {
  /* MyBB stores `closed` as the *string* '1'. A truthiness check locks every thread. */
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
  /* Otherwise a third of an old board reads "last edited 1 January 1970". */
  it('reads an unedited post as never edited', () => {
    expect(mapPost(post(1)).editedAt).toBeNull()
  })

  it('reads an edited post’s time', () => {
    expect(mapPost(post(1, { edituid: 4, edittime: 1_700_000_000 })).editedAt).not.toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * The round trip
 * ------------------------------------------------------------------ */

describe('the fixture round trip', () => {
  it('imports every row', async () => {
    const sink = new MemorySink()
    const report = await runImport({ source: new FixtureMybbSource(BOARD), sink })

    expect(report.finished).toBe(true)
    expect(sink.count('users')).toBe(3)
    expect(sink.count('communities')).toBe(3)
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

  /*
   * **Idempotency.** A chunked import will be interrupted, and the recovery
   * instruction has to be "run it again" — so a second full run must write the
   * same rows and change nothing.
   */
  it('imports twice without duplicating anything', async () => {
    const sink = new MemorySink()
    const source = new FixtureMybbSource(BOARD)

    await runImport({ source, sink })
    const second = await runImport({ source, sink })

    expect(sink.count('posts')).toBe(3)
    expect(second.kinds.posts).toMatchObject({ inserted: 0, updated: 3 })
  })

  /*
   * **Chunking**, proven by the call log rather than by the totals. A page size
   * of one means eleven writes; an importer that quietly fetched everything at
   * once would pass every count assertion above.
   */
  it('reads in pages of the size it was given', async () => {
    const sink = new MemorySink()
    await runImport({ source: new FixtureMybbSource(BOARD), sink, pageSize: 1 })

    expect(sink.calls.filter((call) => call.startsWith('posts:'))).toEqual([
      'posts:1',
      'posts:1',
      'posts:1',
    ])
  })

  /*
   * **Resumability.** The budget stops the run mid-way, and the returned cursors
   * are passed to the next one — a different process, in production.
   */
  it('stops at the budget and resumes exactly where it stopped', async () => {
    const sink = new MemorySink()
    const source = new FixtureMybbSource(BOARD)

    const first = await runImport({ source, sink, pageSize: 2, budget: 4 })
    expect(first.finished).toBe(false)
    expect(first.readThisRun).toBe(4)

    const second = await runImport({ source, sink, pageSize: 2, budget: 100, from: first.cursors })
    expect(second.finished).toBe(true)

    /* Everything arrived exactly once, across the two runs. */
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

  /*
   * Order is a dependency graph: a thread references a community, a post references
   * a thread. Importing posts first means inventing parents or holding every post
   * in memory — the design that works on a small board and dies on a real one.
   */
  it('imports in dependency order', async () => {
    const sink = new MemorySink()
    await runImport({ source: new FixtureMybbSource(BOARD), sink })

    const kinds = sink.calls.map((call) => call.split(':')[0])
    expect(kinds.indexOf('users')).toBeLessThan(kinds.indexOf('communities'))
    expect(kinds.indexOf('communities')).toBeLessThan(kinds.indexOf('threads'))
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

/* ------------------------------------------------------------------ *
 * Counters
 * ------------------------------------------------------------------ */

describe('the counter comparison', () => {
  const communities = BOARD.communities.map(mapCommunity)
  const threads = BOARD.threads.map(mapThread)
  const posts = BOARD.posts.map(mapPost)

  it('reports nothing when MyBB’s counters agree with its content', () => {
    expect(
      compareCounters({
        communities,
        threads,
        posts,
        claimedCommunityTotals: { 2: { threads: 2, posts: 3 } },
      }),
    ).toEqual([])
  })

  /*
   * MyBB's counters drift — incremented on post, not always decremented on
   * delete. The comparison exists to *say so*, not to fail: importing somebody
   * else's arithmetic as truth is what bakes their bug into a fresh board.
   */
  it('names a community whose claimed totals are wrong', () => {
    const differences = compareCounters({
      communities,
      threads,
      posts,
      claimedCommunityTotals: { 2: { threads: 9, posts: 3 } },
    })

    expect(differences).toEqual([{ legacyId: 2, field: 'threads', claimed: 9, actual: 2 }])
  })

  /* Only visible content counts, which is the rule the board's own counters follow. */
  it('does not count deleted or unapproved content', () => {
    const withHidden = [...posts, mapPost(post(4, { pid: 4, visible: -1 }))]
    expect(
      compareCounters({
        communities,
        threads,
        posts: withHidden,
        claimedCommunityTotals: { 2: { threads: 2, posts: 3 } },
      }),
    ).toEqual([])
  })

  it('names a thread whose reply count is wrong', () => {
    const differences = compareCounters({
      communities,
      threads: [mapThread(thread(1, { replies: 7 }))],
      posts,
      claimedCommunityTotals: {},
    })

    /* Two posts in thread 1, so one reply. */
    expect(differences).toEqual([{ legacyId: 1, field: 'replies', claimed: 7, actual: 1 }])
  })

  it('says nothing about a community MyBB gave no totals for', () => {
    expect(compareCounters({ communities, threads, posts, claimedCommunityTotals: {} })).toEqual([])
  })
})
