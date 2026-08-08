/**
 * F73's stored searches and flood control, against real Postgres.
 *
 * Two claims:
 *
 *  - **the flood check is the insert.** A read-then-write check has a window
 *    between the two, and search flooding is precisely the case where twenty
 *    requests arrive at once — the race is the attack, not a footnote;
 *  - **a stored search is owned.** Not because the results would leak (they are
 *    re-resolved against whoever asks) but because the *terms* are private:
 *    what somebody searched for is often more revealing than what they found.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresSearchStore, ownsSearch } from './search-store'

let harness: TestDb
let db: Database
let store: PostgresSearchStore

const ANN = 7
const BOB = 8

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  store = new PostgresSearchStore(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from searches`)
  await db.execute(sql`delete from users`)
  for (const id of [ANN, BOB]) {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (${id}, ${`u${id}`}, ${`u${id}`}, ${`u${id}@example.test`},
              ${`u${id}@example.test`}, 'x', 'argon2id', 2)
    `)
  }
})

const input = (overrides: Record<string, unknown> = {}) => ({
  token: `tok-${Math.random().toString(36).slice(2)}`,
  userId: ANN as number | null,
  sessionKey: null as string | null,
  terms: 'kestrel',
  filters: {},
  floodSeconds: 0,
  ...overrides,
})

describe('create', () => {
  it('stores the query and its filters', async () => {
    const stored = await store.create(
      input({ terms: 'kestrel', filters: { sort: 'newest', communityIds: [3] } }),
    )

    expect(stored).toMatchObject({ terms: 'kestrel', userId: ANN })
    expect(stored?.filters).toEqual({ sort: 'newest', communityIds: [3] })
  })

  it('refuses a second search inside the flood interval', async () => {
    const first = await store.create(input({ floodSeconds: 60 }))
    expect(first).not.toBeNull()

    const second = await store.create(input({ floodSeconds: 60 }))
    expect(second).toBeNull()
  })

  it('returns null rather than throwing, because waiting is an ordinary outcome', async () => {
    /*
     * The screen shows "you are searching too quickly" beside the box. An
     * exception here would make an expected interaction an error page.
     */
    await store.create(input({ floodSeconds: 60 }))
    await expect(store.create(input({ floodSeconds: 60 }))).resolves.toBeNull()
  })

  it('does not throttle at all when the interval is zero', async () => {
    /*
     * `0` is what an unset `search.flood_seconds` means and what `flood.bypass`
     * gets. Kills the mutant that treats zero as "no time has passed" and
     * refuses every search after the first.
     */
    for (let i = 0; i < 3; i += 1) {
      expect(await store.create(input({ floodSeconds: 0 }))).not.toBeNull()
    }
  })

  it('throttles each member separately', async () => {
    /*
     * Kills the mutant that checks "any recent search" rather than this
     * member's — under which one busy member locks out the whole board, which
     * is a denial of service wearing a rate limit's clothes.
     */
    await store.create(input({ userId: ANN, floodSeconds: 60 }))

    expect(await store.create(input({ userId: BOB, floodSeconds: 60 }))).not.toBeNull()
  })

  it('throttles guests by session key rather than lumping them together', async () => {
    await store.create(input({ userId: null, sessionKey: 's1', floodSeconds: 60 }))

    expect(await store.create(input({ userId: null, sessionKey: 's1', floodSeconds: 60 })))
      .toBeNull()
    expect(await store.create(input({ userId: null, sessionKey: 's2', floodSeconds: 60 })))
      .not.toBeNull()
  })

  it('lets a search through once the interval has passed', async () => {
    const first = await store.create(input({ floodSeconds: 60 }))
    await db.execute(sql`
      update searches set created_at = now() - interval '2 minutes' where id = ${first!.id}
    `)

    expect(await store.create(input({ floodSeconds: 60 }))).not.toBeNull()
  })

  it('counts the interval from the newest search, not the oldest', async () => {
    /*
     * Kills the mutant that compares against `min(created_at)`: a member who
     * searched an hour ago and again a second ago would be let straight
     * through, which is the whole population being throttled.
     */
    const old = await store.create(input({ floodSeconds: 0 }))
    await db.execute(sql`
      update searches set created_at = now() - interval '1 hour' where id = ${old!.id}
    `)
    await store.create(input({ floodSeconds: 0 }))

    expect(await store.create(input({ floodSeconds: 60 }))).toBeNull()
  })
})

describe('findByToken', () => {
  it('round-trips a stored search', async () => {
    const stored = await store.create(input({ token: 'abc123' }))
    expect(await store.findByToken('abc123')).toMatchObject({ id: stored!.id })
  })

  it('is null for a token that does not exist', async () => {
    expect(await store.findByToken('nope')).toBeNull()
  })
})

describe('recordHitCount', () => {
  it('remembers what the search found', async () => {
    const stored = await store.create(input())
    await store.recordHitCount(stored!.id, 42)

    expect((await store.findByToken(stored!.token))?.hitCount).toBe(42)
  })
})

describe('prune', () => {
  it('removes searches older than the window, bounded', async () => {
    for (let i = 0; i < 3; i += 1) await store.create(input())
    await db.execute(sql`update searches set created_at = now() - interval '90 days'`)

    expect(await store.prune(new Date(), 2)).toBe(2)
    expect(await store.prune(new Date(), 10)).toBe(1)
  })

  it('leaves recent searches alone', async () => {
    await store.create(input())
    expect(await store.prune(new Date(Date.now() - 86_400_000))).toBe(0)
  })
})

describe('ownsSearch', () => {
  it('lets a member open their own search and nobody else’s', async () => {
    const search = { userId: ANN, sessionKey: null }

    expect(ownsSearch(search, { userId: ANN, sessionKey: null })).toBe(true)
    expect(ownsSearch(search, { userId: BOB, sessionKey: null })).toBe(false)
    expect(ownsSearch(search, { userId: null, sessionKey: 's1' })).toBe(false)
  })

  it('ties a guest’s search to their session', async () => {
    const search = { userId: null, sessionKey: 's5' }

    expect(ownsSearch(search, { userId: null, sessionKey: 's5' })).toBe(true)
    expect(ownsSearch(search, { userId: null, sessionKey: 's6' })).toBe(false)
  })

  it('does not hand a guest’s search to whoever signs in on that session', async () => {
    /*
     * A member who signs in is a different subject. Inheriting the session's
     * searches would attach a stranger's terms to an account — and on a shared
     * computer, that stranger is a real person. Kills the mutant that matches
     * on session alone.
     */
    const search = { userId: null, sessionKey: 's5' }
    expect(ownsSearch(search, { userId: ANN, sessionKey: 's5' })).toBe(false)
  })

  it('lets a search that belongs to nobody be opened with its token', async () => {
    /*
     * **This is the guest, not a corner.** The session key is a hash of the
     * session cookie and a logged-out reader has none, so every search a guest
     * runs is stored with no user and no session. This used to return false,
     * which made `/search?q=…` a 404 for every visitor who had not signed in,
     * on every term — search reported as "does not work", from the reading that
     * a row nobody owns should be reachable by nobody.
     *
     * What guards it now is the token: 144 random bits, held by the one browser
     * that ran the search. Kills the mutant that restores the refusal.
     */
    expect(ownsSearch({ userId: null, sessionKey: null }, { userId: null, sessionKey: null }))
      .toBe(true)
    expect(ownsSearch({ userId: null, sessionKey: null }, { userId: ANN, sessionKey: 's1' }))
      .toBe(true)
  })

  it('still ties an owned search to its owner', async () => {
    /*
     * The guarantee the change above must not have widened: an *owned* row is
     * owned. Kills the mutant that returns true unconditionally, which the two
     * assertions above would otherwise be happy with.
     */
    expect(ownsSearch({ userId: ANN, sessionKey: null }, { userId: null, sessionKey: null }))
      .toBe(false)
    expect(ownsSearch({ userId: null, sessionKey: 's5' }, { userId: null, sessionKey: null }))
      .toBe(false)
  })
})
