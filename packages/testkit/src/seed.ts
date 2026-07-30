/**
 * The deterministic board seeder (F11).
 *
 * "An empty board hides every N+1 and every missing index" — so this exists to
 * produce a board big enough that a query plan means something, and identical
 * on every run so a budget assertion is a fact rather than a coin flip.
 *
 * **Scale is a parameter, and that is the honest part.** The plan's target is
 * 50 forums / 100k threads / 2M posts / 20k users. That is a real-Postgres
 * workload: PGlite is Postgres compiled to WASM holding the database in process
 * memory, and two million posts there would exhaust the heap long before it
 * finished. So `SMOKE_SCALE` runs in every test run, and `FULL_SCALE` is the
 * plan's number pointed at a real database for F89's performance pass.
 *
 * Anything slow *per row* is avoided deliberately:
 *
 *  - every seeded user shares one precomputed Argon2id hash, because hashing
 *    20k passwords at the real cost factor takes minutes and proves nothing the
 *    crypto suite does not already cover;
 *  - rows go in as batched multi-row INSERTs, never one statement each;
 *  - forum paths are tracked in memory rather than read back per forum.
 */
import { schema, type Database } from '@forum/db'
import { eq } from 'drizzle-orm'

import { createRandom, paragraphs, words, type Random } from './random'

export interface SeedScale {
  readonly users: number
  /** Top-level categories. Forums are distributed beneath them. */
  readonly categories: number
  /** Forums in total, across all categories. */
  readonly forums: number
  readonly threads: number
  /** Replies per thread, inclusive. The first post is extra. */
  readonly repliesPerThread: readonly [number, number]
}

/**
 * Small enough that every suite can afford it, large enough that an N+1 shows
 * up — a budget assertion needs more rows than the naive implementation would
 * issue queries for.
 */
export const SMOKE_SCALE: SeedScale = {
  users: 40,
  categories: 3,
  forums: 12,
  threads: 120,
  repliesPerThread: [0, 6],
}

/** The plan's F11 target. Real Postgres only — see the note above. */
export const FULL_SCALE: SeedScale = {
  users: 20_000,
  categories: 6,
  forums: 50,
  threads: 100_000,
  repliesPerThread: [10, 30],
}

/**
 * The plaintext every seeded user shares. Safe because seeded users exist only
 * in test databases; the hash below is a fixed literal, not a live credential.
 */
export const SEEDED_PASSWORD = 'seeded-password-not-a-secret'
const SEEDED_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2VlZGVkc2FsdHNlZWRlZHNhbHQ$c2VlZGVkaGFzaHNlZWRlZGhhc2hzZWVkZWRoYXNoc2U'

export interface SeededBoard {
  readonly userIds: readonly number[]
  readonly categoryIds: readonly number[]
  readonly forumIds: readonly number[]
  readonly threadIds: readonly number[]
  readonly postCount: number
}

/** Chunked writes: one 100k-row INSERT exceeds the bind-parameter limit. */
async function inBatches<T>(
  rows: readonly T[],
  size: number,
  write: (batch: readonly T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await write(rows.slice(i, i + size))
  }
}

/**
 * Seed a board. Same `seed` in, same board out.
 *
 * Assumes migrations have run, so the usergroup ladder exists; users are filed
 * into `registered` by key rather than by a hardcoded id.
 */
export async function seedBoard(
  db: Database,
  scale: SeedScale = SMOKE_SCALE,
  seed = 20260730,
): Promise<SeededBoard> {
  const random = createRandom(seed)
  const groupId = await registeredGroupId(db)

  const userIds = await seedUsers(db, scale, random, groupId)
  const { categoryIds, forumIds } = await seedForums(db, scale, random)
  const { threadIds, postCount } = await seedThreads(db, scale, random, forumIds, userIds)

  return { userIds, categoryIds, forumIds, threadIds, postCount }
}

async function registeredGroupId(db: Database): Promise<number> {
  const rows = await db
    .select({ id: schema.usergroups.id })
    .from(schema.usergroups)
    .where(eq(schema.usergroups.key, 'registered'))
    .limit(1)

  const id = rows[0]?.id
  if (id === undefined) {
    throw new Error('seedBoard: no "registered" usergroup. Run migrations before seeding.')
  }
  return id
}

async function seedUsers(
  db: Database,
  scale: SeedScale,
  random: Random,
  groupId: number,
): Promise<number[]> {
  const rows = Array.from({ length: scale.users }, (_, i) => {
    const username = `user${i + 1}`
    return {
      username,
      usernameLower: username,
      email: `${username}@example.test`,
      emailLower: `${username}@example.test`,
      passwordHash: SEEDED_PASSWORD_HASH,
      passwordAlgo: 'argon2id',
      primaryGroupId: groupId,
      displayGroupId: groupId,
      // Spread over two years so "newest member" and any date-ordered query
      // have something real to sort.
      createdAt: daysAgo(random.int(1, 730)),
    }
  })

  const ids: number[] = []
  await inBatches(rows, 500, async (batch) => {
    const inserted = await db
      .insert(schema.users)
      .values([...batch])
      .returning({ id: schema.users.id })
    ids.push(...inserted.map((r) => r.id))
  })
  return ids
}

/**
 * Forums are created one at a time because `path` needs the id the database
 * assigns. Paths are accumulated in memory rather than read back, so this is
 * two statements per forum and never a query per ancestor.
 *
 * There are at most a few dozen forums even at full scale — this is the one
 * place where per-row work is affordable, and it buys a genuinely nested tree.
 */
async function seedForums(
  db: Database,
  scale: SeedScale,
  random: Random,
): Promise<{ categoryIds: number[]; forumIds: number[] }> {
  const pathById = new Map<number, string>()
  const categoryIds: number[] = []
  const forumIds: number[] = []

  const create = async (
    values: typeof schema.forums.$inferInsert,
    parentPath: string | null,
  ): Promise<number> => {
    const [row] = await db
      .insert(schema.forums)
      .values({ ...values, path: '' })
      .returning({ id: schema.forums.id })

    const id = row?.id as number
    const path = parentPath === null ? String(id) : `${parentPath}.${id}`
    await db.update(schema.forums).set({ path }).where(eq(schema.forums.id, id))
    pathById.set(id, path)
    return id
  }

  for (let i = 0; i < scale.categories; i++) {
    categoryIds.push(
      await create(
        {
          type: 'category',
          title: `Category ${i + 1}`,
          slug: `category-${i + 1}`,
          path: '',
          depth: 0,
          displayOrder: i,
        },
        null,
      ),
    )
  }

  for (let i = 0; i < scale.forums; i++) {
    /*
     * About a quarter of forums nest under another forum rather than under a
     * category, so the tree has real depth. A flat board would let a broken
     * ancestor walk pass every test.
     */
    const parentId =
      forumIds.length > 0 && random.chance(0.25)
        ? random.pick(forumIds)
        : random.pick(categoryIds)

    const parentPath = pathById.get(parentId) as string

    forumIds.push(
      await create(
        {
          type: 'forum',
          title: `${words(random, 2)} ${i + 1}`,
          slug: `forum-${i + 1}`,
          description: words(random, 8),
          parentId,
          path: '',
          depth: parentPath.split('.').length,
          displayOrder: i,
        },
        parentPath,
      ),
    )
  }

  return { categoryIds, forumIds }
}

async function seedThreads(
  db: Database,
  scale: SeedScale,
  random: Random,
  forumIds: readonly number[],
  userIds: readonly number[],
): Promise<{ threadIds: number[]; postCount: number }> {
  const threadRows = Array.from({ length: scale.threads }, (_, i) => {
    const authorIndex = random.int(0, userIds.length - 1)
    const createdAt = daysAgo(random.int(0, 500))
    return {
      forumId: random.pick(forumIds),
      title: `${words(random, 4)} ${i + 1}`,
      slug: `thread-${i + 1}`,
      authorUserId: userIds[authorIndex] as number,
      authorUsername: `user${authorIndex + 1}`,
      // ~4% sticky, matching a busy board: enough to exercise sticky-first
      // ordering and its separator without swamping page one.
      isSticky: random.chance(0.04),
      isLocked: random.chance(0.02),
      createdAt,
      lastPostAt: createdAt,
    }
  })

  const threadIds: number[] = []
  await inBatches(threadRows, 500, async (batch) => {
    const inserted = await db
      .insert(schema.threads)
      .values([...batch])
      .returning({ id: schema.threads.id })
    threadIds.push(...inserted.map((r) => r.id))
  })

  const posts: (typeof schema.posts.$inferInsert)[] = []

  threadIds.forEach((threadId, index) => {
    const thread = threadRows[index] as (typeof threadRows)[number]
    const replies = random.int(scale.repliesPerThread[0], scale.repliesPerThread[1])

    for (let p = 0; p <= replies; p++) {
      const authorIndex = random.int(0, userIds.length - 1)
      posts.push({
        threadId,
        forumId: thread.forumId,
        authorUserId: userIds[authorIndex] as number,
        authorUsername: `user${authorIndex + 1}`,
        subject: p === 0 ? thread.title : null,
        message: paragraphs(random, random.int(1, 3)),
        isFirstPost: p === 0,
        createdAt: thread.createdAt,
      })
    }
  })

  await inBatches(posts, 500, (batch) => db.insert(schema.posts).values([...batch]))

  return { threadIds, postCount: posts.length }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}
