import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT, contentScopeFrom } from '@meith/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'
import {
  ONLINE_WINDOW_MINUTES,
  PostgresPresenceRepository,
  type OnlineScope,
} from './presence-repo'

let harness: TestDb
let db: Database
let repo: PostgresPresenceRepository

const OPEN = 1
const SECRET = 2
const ANN = 7
const BOB = 8
const CID = 9

const NOW = new Date('2026-05-05T12:00:00Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresPresenceRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from sessions`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`update board_stats set most_online_count = 0, most_online_at = null`)

  await db.execute(sql`
    insert into forums (id, type, title, slug, path) values
      (${OPEN}, 'forum', 'Open', 'open', '1'),
      (${SECRET}, 'forum', 'Staff room', 'staff', '2')
  `)
  for (const id of [ANN, BOB, CID]) {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (${id}, ${`u${id}`}, ${`u${id}`}, ${`u${id}@example.test`},
              ${`u${id}@example.test`}, 'x', 'argon2id', 2)
    `)
  }
})

interface SeedSession {
  readonly id: number
  readonly userId?: number | null
  readonly lastSeenAt?: Date
  readonly forumId?: number | null
  readonly threadId?: number | null
  readonly revoked?: boolean
}

async function seedSession(input: SeedSession): Promise<void> {
  await db.execute(sql`
    insert into sessions (id, token_hash, user_id, location_forum_id, location_thread_id,
                          last_seen_at, expires_at, revoked_at)
    values (${input.id}, ${`hash-${input.id}`}, ${input.userId ?? null},
            ${input.forumId ?? null}, ${input.threadId ?? null},
            ${input.lastSeenAt ?? ago(1)},
            ${new Date(NOW.getTime() + 86_400_000)},
            ${input.revoked === true ? NOW : null})
  `)
}

async function seedThread(id: number, forumId: number, visibility = 'visible') {
  await db.execute(sql`
    insert into threads (id, forum_id, author_user_id, author_username, title, slug, visibility)
    values (${id}, ${forumId}, ${ANN}, 'ann', ${`Thread ${id}`}, ${`t-${id}`}, ${visibility})
  `)
}

const scope = (overrides: Partial<OnlineScope> = {}): OnlineScope => ({
  forumIds: [OPEN],
  ownThreadsOnlyForumIds: [],
  viewerUserId: null,
  content: PUBLIC_CONTENT,
  seesInvisible: false,
  ...overrides,
})

describe('who is here', () => {
  it('lists members seen inside the window and drops those outside it', async () => {
    await seedSession({ id: 1, userId: ANN, lastSeenAt: ago(ONLINE_WINDOW_MINUTES - 1) })
    await seedSession({ id: 2, userId: BOB, lastSeenAt: ago(ONLINE_WINDOW_MINUTES + 1) })

    const snapshot = await repo.onlineNow(NOW, scope())
    expect(snapshot.members.map((m) => m.userId)).toEqual([ANN])
  })

  it('counts guests without naming them', async () => {
    await seedSession({ id: 1, userId: null })
    await seedSession({ id: 2, userId: null })
    await seedSession({ id: 3, userId: ANN })

    const snapshot = await repo.onlineNow(NOW, scope())
    expect(snapshot.guestCount).toBe(2)
    expect(snapshot.members).toHaveLength(1)
    expect(snapshot.total).toBe(3)
  })

  it('counts a member with two devices once', async () => {
    await seedSession({ id: 1, userId: ANN, lastSeenAt: ago(5), forumId: OPEN })
    await seedSession({ id: 2, userId: ANN, lastSeenAt: ago(1), forumId: null })

    const snapshot = await repo.onlineNow(NOW, scope())
    expect(snapshot.members).toHaveLength(1)
    expect(snapshot.members[0]?.forumId).toBeNull()
  })

  it('ignores a revoked session', async () => {
    await seedSession({ id: 1, userId: ANN, revoked: true })
    expect((await repo.onlineNow(NOW, scope())).total).toBe(0)
  })

  it('ignores a session belonging to an account that is not active', async () => {
    await db.execute(sql`update users set state = 'banned' where id = ${ANN}`)
    await seedSession({ id: 1, userId: ANN })

    expect((await repo.onlineNow(NOW, scope())).members).toEqual([])
  })
})

describe('the location is resolved against the reader', () => {
  it('names a forum the reader may see', async () => {
    await seedSession({ id: 1, userId: ANN, forumId: OPEN })

    const snapshot = await repo.onlineNow(NOW, scope())
    expect(snapshot.members[0]).toMatchObject({ forumId: OPEN, forumTitle: 'Open' })
  })

  it('withholds a forum the reader may not see, and still lists the member', async () => {
    await seedSession({ id: 1, userId: ANN, forumId: SECRET })

    const snapshot = await repo.onlineNow(NOW, scope({ forumIds: [OPEN] }))
    expect(snapshot.members).toHaveLength(1)
    expect(snapshot.members[0]).toMatchObject({ forumId: null, forumTitle: null })
  })

  it('names nothing at all when the reader can see no forum', async () => {
    await seedSession({ id: 1, userId: ANN, forumId: OPEN })

    const snapshot = await repo.onlineNow(NOW, scope({ forumIds: [] }))
    expect(snapshot.members[0]?.forumTitle).toBeNull()
  })

  it('withholds a thread the reader’s content scope hides', async () => {
    await seedThread(10, OPEN, 'deleted')
    await seedSession({ id: 1, userId: ANN, forumId: OPEN, threadId: 10 })

    const asMember = await repo.onlineNow(NOW, scope())
    expect(asMember.members[0]).toMatchObject({ threadId: null, threadTitle: null })
    expect(asMember.members[0]?.forumTitle).toBe('Open')

    const staffScope = scope({
      content: contentScopeFrom({ seesUnapproved: true, seesDeleted: true }),
    })
    const asStaff = await repo.onlineNow(NOW, staffScope)
    expect(asStaff.members[0]).toMatchObject({ threadId: 10, threadTitle: 'Thread 10' })
  })

  it('names a thread the reader may see, with its slug for the link', async () => {
    await seedThread(11, OPEN)
    await seedSession({ id: 1, userId: ANN, forumId: OPEN, threadId: 11 })

    expect((await repo.onlineNow(NOW, scope())).members[0]).toMatchObject({
      threadId: 11,
      threadTitle: 'Thread 11',
      threadSlug: 't-11',
    })
  })
})

describe('invisible members', () => {
  it('are absent from the list and from the count', async () => {
    await db.execute(sql`update users set invisible = true where id = ${BOB}`)
    await seedSession({ id: 1, userId: ANN })
    await seedSession({ id: 2, userId: BOB })

    const snapshot = await repo.onlineNow(NOW, scope())
    expect(snapshot.members.map((m) => m.userId)).toEqual([ANN])
    expect(snapshot.total).toBe(1)
    expect(snapshot.invisibleCount).toBe(0)
  })

  it('are listed to staff, marked, and counted', async () => {
    await db.execute(sql`update users set invisible = true where id = ${BOB}`)
    await seedSession({ id: 1, userId: ANN })
    await seedSession({ id: 2, userId: BOB })

    const snapshot = await repo.onlineNow(NOW, scope({ seesInvisible: true }))
    expect(snapshot.members.map((m) => m.userId).sort()).toEqual([ANN, BOB])
    expect(snapshot.members.find((m) => m.userId === BOB)?.invisible).toBe(true)
    expect(snapshot.total).toBe(2)
    expect(snapshot.invisibleCount).toBe(1)
  })
})

describe('the record', () => {
  it('counts everybody, including the invisible', async () => {
    await db.execute(sql`update users set invisible = true where id = ${BOB}`)
    await seedSession({ id: 1, userId: ANN })
    await seedSession({ id: 2, userId: BOB })
    await seedSession({ id: 3, userId: null })

    expect(await repo.concurrentCount(NOW)).toBe(3)
  })

  it('rises when beaten and holds when not', async () => {
    expect(await repo.recordIfHigher(5, NOW)).toBe(true)
    expect((await repo.readRecord()).count).toBe(5)

    expect(await repo.recordIfHigher(5, new Date(NOW.getTime() + 60_000))).toBe(false)
    expect(await repo.recordIfHigher(4, new Date(NOW.getTime() + 60_000))).toBe(false)
    expect((await repo.readRecord()).at?.toISOString()).toBe(NOW.toISOString())
  })

  it('reads back zero and no date before anything has happened', async () => {
    expect(await repo.readRecord()).toEqual({ count: 0, at: null })
  })
})

describe('recording a guest', () => {
  const guest = (over: Partial<Parameters<typeof repo.touchGuest>[0]> = {}) => ({
    tokenHash: 'guest-one',
    location: { path: '/', forumId: null, threadId: null },
    now: NOW,
    windowSeconds: 60,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    ...over,
  })

  it('makes an anonymous reader countable at all', async () => {
    await repo.touchGuest(guest())

    const snapshot = await repo.onlineNow(NOW, scope())
    expect(snapshot.guestCount).toBe(1)
    expect(snapshot.total).toBe(1)
    expect(snapshot.members).toHaveLength(0)
  })

  it('counts one reader once however many pages they read', async () => {
    await repo.touchGuest(guest())
    await repo.touchGuest(guest({ now: new Date(NOW.getTime() + 120_000) }))
    await repo.touchGuest(guest({ now: new Date(NOW.getTime() + 240_000) }))

    const at = new Date(NOW.getTime() + 240_000)
    expect((await repo.onlineNow(at, scope())).guestCount).toBe(1)
  })

  it('counts two readers as two', async () => {
    await repo.touchGuest(guest({ tokenHash: 'guest-one' }))
    await repo.touchGuest(guest({ tokenHash: 'guest-two' }))

    expect((await repo.onlineNow(NOW, scope())).guestCount).toBe(2)
  })

  it('throttles the write, so clicking about does not cost an update a page', async () => {
    await repo.touchGuest(guest())
    await repo.touchGuest(
      guest({ now: new Date(NOW.getTime() + 5_000), location: { path: '/later', forumId: null, threadId: null } }),
    )

    const rows = resultRows(
      await db.execute(sql`select location_path from sessions where token_hash = 'guest-one'`),
    ) as Array<{ location_path: string }>

    expect(rows[0]?.location_path).toBe('/')
  })

  it('drops out of the window when the reader leaves', async () => {
    await repo.touchGuest(guest())

    const later = new Date(NOW.getTime() + (ONLINE_WINDOW_MINUTES + 1) * 60_000)
    expect((await repo.onlineNow(later, scope())).guestCount).toBe(0)
  })

  /**
   * A reader who signs in was a guest a second ago, and that row is still well
   * inside the fifteen-minute window. Left behind it counts them twice — once by
   * name in the list, once anonymously in the total.
   */
  it('is forgotten when the reader holding it signs in', async () => {
    await repo.touchGuest(guest())
    expect((await repo.onlineNow(NOW, scope())).guestCount).toBe(1)

    await repo.dropGuest('guest-one')
    await seedSession({ id: 99, userId: ANN })

    const snapshot = await repo.onlineNow(NOW, scope())
    expect(snapshot.guestCount).toBe(0)
    expect(snapshot.members.map((m) => m.userId)).toEqual([ANN])
    expect(snapshot.total).toBe(1)
  })

  it('is never dropped by a token that belongs to a member', async () => {
    await seedSession({ id: 1, userId: ANN })
    await repo.dropGuest('hash-1')

    expect((await repo.onlineNow(NOW, scope())).members).toHaveLength(1)
  })

  it('will not overwrite a signed-in member’s session, whatever it is handed', async () => {
    await seedSession({ id: 1, userId: ANN, lastSeenAt: ago(10) })
    await repo.touchGuest(guest({ tokenHash: 'hash-1' }))

    const snapshot = await repo.onlineNow(NOW, scope())
    expect(snapshot.members.map((m) => m.userId)).toEqual([ANN])
    expect(snapshot.guestCount).toBe(0)
  })
})
