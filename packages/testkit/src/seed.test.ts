/**
 * The seeder's contract is determinism. If the same seed produced different
 * boards, every budget and performance assertion built on it would be a coin
 * flip — and the first three green runs would teach everyone to re-run a
 * failure rather than read it.
 */
import { schema } from '@forum/db'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@forum/db/pglite.fixture'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createRandom } from './random'
import { SMOKE_SCALE, seedBoard, type SeededBoard } from './seed'

let harness: TestDb
let board: SeededBoard

beforeAll(async () => {
  harness = await createTestDb()
  board = await seedBoard(harness.db, SMOKE_SCALE)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

describe('seedBoard', () => {
  it('creates the requested users, categories and forums', async () => {
    expect(board.userIds).toHaveLength(SMOKE_SCALE.users)
    expect(board.categoryIds).toHaveLength(SMOKE_SCALE.categories)
    expect(board.forumIds).toHaveLength(SMOKE_SCALE.forums)
    expect(board.threadIds).toHaveLength(SMOKE_SCALE.threads)
  })

  it('writes rows the database actually agrees exist', async () => {
    const users = await harness.db.select({ id: schema.users.id }).from(schema.users)
    const posts = await harness.db.select({ id: schema.posts.id }).from(schema.posts)

    expect(users).toHaveLength(SMOKE_SCALE.users)
    expect(posts).toHaveLength(board.postCount)
  })

  it('gives every thread a first post', async () => {
    const firsts = await harness.db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(eq(schema.posts.isFirstPost, true))

    expect(firsts).toHaveLength(SMOKE_SCALE.threads)
  })

  /*
   * A flat board would let a broken ancestor walk pass every test, so the
   * seeder deliberately nests about a quarter of forums under another forum.
   */
  it('produces a genuinely nested tree, not a flat one', async () => {
    const forums = await harness.db
      .select({ depth: schema.forums.depth, path: schema.forums.path })
      .from(schema.forums)

    const maxDepth = Math.max(...forums.map((f) => f.depth))
    expect(maxDepth).toBeGreaterThanOrEqual(2)

    // Every path is well formed: dot-separated positive ids, no empty segments.
    for (const forum of forums) {
      expect(forum.path).toMatch(/^\d+(\.\d+)*$/)
    }
  })

  it('leaves every forum path consistent with its depth', async () => {
    const forums = await harness.db
      .select({ depth: schema.forums.depth, path: schema.forums.path })
      .from(schema.forums)

    for (const forum of forums) {
      expect(forum.path.split('.').length - 1).toBe(forum.depth)
    }
  })

  it('spreads threads across more than one forum', async () => {
    const threads = await harness.db
      .select({ forumId: schema.threads.forumId })
      .from(schema.threads)

    // One forum holding everything would hide any per-forum query cost.
    expect(new Set(threads.map((t) => t.forumId)).size).toBeGreaterThan(1)
  })

  it('is deterministic — the same seed rebuilds the same board', async () => {
    const second = await createTestDb()
    try {
      const again = await seedBoard(second.db, SMOKE_SCALE)

      expect(again.postCount).toBe(board.postCount)
      expect(again.threadIds).toHaveLength(board.threadIds.length)

      const titlesOf = async (h: TestDb) =>
        (
          await h.db
            .select({ title: schema.threads.title, sticky: schema.threads.isSticky })
            .from(schema.threads)
            .orderBy(schema.threads.id)
        ).map((t) => `${t.sticky ? '*' : ''}${t.title}`)

      // Titles *and* stickiness: both come from the PRNG, so this catches a
      // drift in the sequence that row counts alone would not.
      expect(await titlesOf(second)).toEqual(await titlesOf(harness))
    } finally {
      await second.close()
    }
  }, 60_000)

  it('produces a different board for a different seed', async () => {
    const other = await createTestDb()
    try {
      await seedBoard(other.db, SMOKE_SCALE, 999)
      const [a] = await other.db
        .select({ title: schema.threads.title })
        .from(schema.threads)
        .orderBy(schema.threads.id)
        .limit(1)
      const [b] = await harness.db
        .select({ title: schema.threads.title })
        .from(schema.threads)
        .orderBy(schema.threads.id)
        .limit(1)

      // Otherwise the seed parameter is decorative and no one would notice.
      expect(a?.title).not.toBe(b?.title)
    } finally {
      await other.close()
    }
  }, 60_000)
})

describe('createRandom', () => {
  it('repeats exactly for the same seed', () => {
    const a = createRandom(42)
    const b = createRandom(42)
    const draw = (r: ReturnType<typeof createRandom>) =>
      Array.from({ length: 20 }, () => r.int(0, 1000))

    expect(draw(a)).toEqual(draw(b))
  })

  it('diverges for different seeds', () => {
    const a = Array.from({ length: 20 }, () => createRandom(1).int(0, 1000))
    const b = Array.from({ length: 20 }, () => createRandom(2).int(0, 1000))
    expect(a).not.toEqual(b)
  })

  it('stays inside its bounds', () => {
    const r = createRandom(7)
    for (let i = 0; i < 500; i++) {
      const value = r.int(3, 9)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(9)
    }
  })

  it('refuses to pick from an empty array rather than returning undefined', () => {
    expect(() => createRandom(1).pick([])).toThrow()
  })
})
