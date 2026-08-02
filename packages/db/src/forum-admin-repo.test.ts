/**
 * F65's writes, against real Postgres.
 *
 * `forum_permissions` has had a reader since F21 and no writer at all, so every
 * claim about how a null round-trips is settled here for the first time:
 *
 *  - null means inherit and is *written*, not deleted;
 *  - a row all of whose columns are null is deleted, because that is what it
 *    means;
 *  - the subtree is a prefix match on `path`, and `10.2` does not match `10.20`;
 *  - a copy makes descendants **identical**, extra rows included.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { FORUM_PERMISSION_FIELDS } from '@forum/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresForumAdminRepository } from './forum-admin-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresForumAdminRepository

const ROOT = 10
const CHILD = 20
const GRANDCHILD = 30
/* `10.2` would prefix-match `10.20` without the trailing dot. This is that. */
const DECOY = 200

const REGISTERED = 2
const STAFF = 3

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresForumAdminRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from forum_permissions`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`
    insert into forums (id, type, title, slug, path, depth, display_order)
    values (${ROOT}, 'category', 'Root', 'root', '10', 0, 1),
           (${CHILD}, 'forum', 'Child', 'child', '10.20', 1, 1),
           (${GRANDCHILD}, 'forum', 'Grandchild', 'grandchild', '10.20.30', 2, 1),
           (${DECOY}, 'forum', 'Decoy', 'decoy', '10.200', 1, 2)
  `)
})

/** Every forum-scoped key, all null but the ones given. */
function values(over: Record<string, boolean | number | null> = {}) {
  const out: Record<string, boolean | number | null> = {}
  for (const field of FORUM_PERMISSION_FIELDS) out[field.key] = null
  return { ...out, ...over }
}

async function storedRowCount(): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select count(*)::int as n from forum_permissions`),
  ) as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}

describe('updateOptions', () => {
  it('writes every editable option and leaves the tree columns alone', async () => {
    await repo.updateOptions(CHILD, {
      title: 'Renamed',
      slug: 'renamed',
      description: 'A description',
      linkUrl: null,
      displayOrder: 7,
      isOpen: false,
      allowThreads: false,
      allowReplies: true,
      allowPolls: false,
      allowAttachments: false,
      requiresPrefix: true,
      moderateNewThreads: true,
      moderateNewPosts: false,
    })

    const [row] = resultRows(
      await db.execute(sql`
        select title, slug, description, display_order, is_open, allow_threads,
               moderate_new_threads, path, depth, parent_id
          from forums where id = ${CHILD}
      `),
    ) as Array<Record<string, unknown>>

    expect(row).toMatchObject({
      title: 'Renamed',
      slug: 'renamed',
      display_order: 7,
      is_open: false,
      allow_threads: false,
      moderate_new_threads: true,
      /* Position in the tree is `move`'s business, not this statement's. */
      path: '10.20',
      depth: 1,
    })
  })
})

describe('overrides', () => {
  it('writes a value and reads it back', async () => {
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostThreads: false }))

    expect(await repo.readOverrides([CHILD])).toEqual([
      { forumId: CHILD, groupId: REGISTERED, overrides: { canPostThreads: false } },
    ])
  })

  it('leaves a null out of what it reads back, so the walk does not stop on it', async () => {
    /*
     * `ForumOverride.overrides` holds only the keys that are set. A
     * present-but-null key would stop the resolver's ancestor walk at the wrong
     * forum — which is the bug that makes a parent's change do nothing.
     */
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostThreads: false }))

    const [override] = await repo.readOverrides([CHILD])
    expect(Object.keys(override!.overrides)).toEqual(['canPostThreads'])
  })

  it('writes a numeric zero rather than treating it as absent', async () => {
    /* 0 is *unlimited* (R4.2), so it has to survive a round trip as a value. */
    await repo.saveOverrides(CHILD, REGISTERED, values({ maxAttachmentsPerPost: 0 }))

    const [override] = await repo.readOverrides([CHILD])
    expect(override?.overrides.maxAttachmentsPerPost).toBe(0)
  })

  it('clears one cell without clearing the row', async () => {
    await repo.saveOverrides(
      CHILD,
      REGISTERED,
      values({ canPostThreads: false, canPostReplies: false }),
    )
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostReplies: false }))

    const [override] = await repo.readOverrides([CHILD])
    expect(override?.overrides).toEqual({ canPostReplies: false })
  })

  it('deletes a row whose every cell is inherit', async () => {
    /*
     * A row that says nothing still costs the resolver a lookup on every
     * permission check on every page — and an operator who cleared a forum's
     * overrides would have no way to tell it worked. Kills the mutant that
     * writes all-nulls.
     */
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostThreads: false }))
    expect(await storedRowCount()).toBe(1)

    await repo.saveOverrides(CHILD, REGISTERED, values())
    expect(await storedRowCount()).toBe(0)
  })

  it('reads several forums at once, which the matrix needs for the chain', async () => {
    await repo.saveOverrides(ROOT, REGISTERED, values({ canPostThreads: true }))
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostThreads: false }))

    const found = await repo.readOverrides([CHILD, ROOT])
    expect(found).toHaveLength(2)
  })

  it('is empty for no forums, without asking the database', async () => {
    expect(await repo.readOverrides([])).toEqual([])
  })

  it('goes with the forum, by cascade', async () => {
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostThreads: false }))
    await db.execute(sql`delete from forums where id = ${CHILD}`)

    expect(await repo.readOverrides([CHILD])).toEqual([])
  })
})

describe('descendantIds', () => {
  it('finds everything strictly beneath, at every depth', async () => {
    expect(await repo.descendantIds(ROOT)).toEqual([CHILD, GRANDCHILD, DECOY])
  })

  it('does not match a sibling whose path merely starts the same', async () => {
    /*
     * `10.20` and `10.200`. Without the trailing dot in the prefix, a copy from
     * one forum would reach into another subtree entirely — silently, and with
     * no undo. Kills the mutant that drops it.
     */
    expect(await repo.descendantIds(CHILD)).toEqual([GRANDCHILD])
  })

  it('is empty for a leaf', async () => {
    expect(await repo.descendantIds(GRANDCHILD)).toEqual([])
  })
})

describe('copyToDescendants', () => {
  it('makes a descendant identical, including clearing what it had', async () => {
    /*
     * "Copy" has to mean identical. A descendant that explicitly denied
     * something the source inherits would otherwise keep denying it, and the
     * operator would be looking at two forums they were told are the same.
     * Kills the mutant that upserts without clearing.
     */
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostThreads: false }))
    await repo.saveOverrides(GRANDCHILD, REGISTERED, values({ canPostReplies: false }))

    await repo.copyToDescendants(CHILD, [GRANDCHILD], [REGISTERED])

    const [override] = await repo.readOverrides([GRANDCHILD])
    expect(override?.overrides).toEqual({ canPostThreads: false })
  })

  it('leaves a descendant with no row when the source has none', async () => {
    await repo.saveOverrides(GRANDCHILD, REGISTERED, values({ canPostThreads: false }))

    await repo.copyToDescendants(CHILD, [GRANDCHILD], [REGISTERED])

    expect(await repo.readOverrides([GRANDCHILD])).toEqual([])
  })

  it('touches only the groups it was given', async () => {
    await repo.saveOverrides(GRANDCHILD, STAFF, values({ canPostThreads: true }))
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostThreads: false }))

    await repo.copyToDescendants(CHILD, [GRANDCHILD], [REGISTERED])

    const staff = (await repo.readOverrides([GRANDCHILD])).find(
      (o) => o.groupId === STAFF,
    )
    expect(staff?.overrides).toEqual({ canPostThreads: true })
  })

  it('touches only the forums it was given', async () => {
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostThreads: false }))
    await repo.saveOverrides(DECOY, REGISTERED, values({ canPostThreads: true }))

    await repo.copyToDescendants(CHILD, [GRANDCHILD], [REGISTERED])

    const decoy = (await repo.readOverrides([DECOY]))[0]
    expect(decoy?.overrides).toEqual({ canPostThreads: true })
  })

  it('does nothing at all when there is nothing to copy to', async () => {
    await repo.saveOverrides(CHILD, REGISTERED, values({ canPostThreads: false }))

    await repo.copyToDescendants(CHILD, [], [REGISTERED])
    await repo.copyToDescendants(CHILD, [GRANDCHILD], [])

    expect(await storedRowCount()).toBe(1)
  })

  it('carries a numeric zero through the copy', async () => {
    await repo.saveOverrides(CHILD, REGISTERED, values({ maxAttachmentsPerPost: 0 }))
    await repo.copyToDescendants(CHILD, [GRANDCHILD], [REGISTERED])

    const [override] = await repo.readOverrides([GRANDCHILD])
    expect(override?.overrides.maxAttachmentsPerPost).toBe(0)
  })
})
