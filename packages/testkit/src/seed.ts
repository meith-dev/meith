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
  /**
   * A handful of enormous threads, on top of `threads`.
   *
   * A board of uniformly 20-post threads is not a small version of a real
   * board, it is a different shape — and it is the shape that makes deep
   * pagination look free. Every thread fits on one page, so a keyset cursor and
   * an `OFFSET` cost exactly the same and the load test proves nothing about
   * the claim it exists to check.
   *
   * Real boards have a long tail: thousands of short threads and a few with
   * tens of thousands of posts, and those few are where the reading happens.
   * Omit for a uniform board.
   */
  readonly longThreads?: {
    readonly count: number
    /** Posts per long thread, inclusive. */
    readonly posts: readonly [number, number]
  }
  /**
   * A distinctive word sprinkled into one post in `everyNthPost`.
   *
   * The seeder's vocabulary is sixteen common words, and a post is twenty to
   * sixty of them — so *every* word matches nearly every post, and there is no
   * such thing as a selective query against this corpus. That is fine for the
   * listings and useless for search, where the two cases that matter are a term
   * matching a million rows and a term matching a handful.
   *
   * Injecting a rare word makes the second case exist. It is placed by counting
   * posts rather than by drawing from `random`, so adding it does not shift the
   * pseudo-random sequence and a board seeded without it is unchanged.
   *
   * **Keep this coprime with `hiddenContent`'s intervals.** It was 2,000 first,
   * which shares every factor of 50 and 100 — so when the visibility mix arrived,
   * *every single* rare-term post became soft-deleted and the rare-term search
   * scenario matched nothing. Two independent-looking "every Nth row" rules are
   * not independent if their periods share a factor; a prime avoids the whole
   * family of collisions rather than just the one that was noticed.
   */
  readonly rareTerm?: {
    readonly word: string
    readonly everyNthPost: number
  }
  /**
   * A realistic minority of hidden content.
   *
   * Every seeded row is `visible` without this, and that makes a whole class of
   * index unmeasurable. R3.5's partial indexes exist to keep unapproved and
   * soft-deleted rows out of the common path — but on an all-visible board the
   * partial index and its unfiltered twin cover *exactly the same rows*, so the
   * planner is free to pick either and `EXPLAIN` evidence proves nothing. The
   * moderation queue is worse: its index matches no rows at all, so the query is
   * instant and the measurement is of an empty set.
   *
   * One row in `unapprovedInN` is held for approval, one in `deletedInN` is soft
   * deleted. Applied by counting rather than by drawing from `random`, so adding
   * it leaves the pseudo-random sequence — and every board seeded without it —
   * untouched.
   */
  readonly hiddenContent?: {
    readonly unapprovedInN: number
    readonly deletedInN: number
  }
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

/**
 * The plan's F11 target. Real Postgres only — see the note above.
 *
 * The long tail is on top of the plan's number rather than carved out of it:
 * 100k ordinary threads still produce their ~2M posts, and thirty archive
 * threads add a few hundred thousand more. F89's deep-page budgets are
 * meaningless without them — with every thread under one page, a keyset cursor
 * and an `OFFSET` are indistinguishable.
 */
export const FULL_SCALE: SeedScale = {
  users: 20_000,
  categories: 6,
  forums: 50,
  threads: 100_000,
  repliesPerThread: [10, 30],
  longThreads: { count: 30, posts: [2_000, 15_000] },
  rareTerm: { word: 'quinsyflange', everyNthPost: 1_999 },
  /* ~2% held for approval, ~1% soft deleted. A quiet, well-moderated board. */
  hiddenContent: { unapprovedInN: 50, deletedInN: 100 },
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
      visibility: visibilityFor(scale, i),
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

  /*
   * Posts are generated and flushed in batches rather than accumulated.
   *
   * The first version built the whole array first, which is fine at
   * `SMOKE_SCALE` and impossible at `FULL_SCALE`: two million post objects, each
   * carrying one to three paragraphs of body text, is several gigabytes of live
   * JS heap before a single row is written. F89 needed the full board on real
   * Postgres, and the seeder was the thing standing in the way.
   *
   * The **generation order is unchanged**, so the pseudo-random sequence is
   * identical and a given seed still produces exactly the same board. That
   * matters more than it sounds: every existing budget assertion is written
   * against this data, and a seeder whose output shifted would have quietly
   * rewritten what those tests mean.
   */
  let batch: (typeof schema.posts.$inferInsert)[] = []
  let postCount = 0
  let generated = 0

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return
    await db.insert(schema.posts).values(batch)
    postCount += batch.length
    batch = []
  }

  /** The body, with the rare term appended to every nth post. */
  const body = (text: string): string => {
    const rare = scale.rareTerm
    generated++
    return rare !== undefined && generated % rare.everyNthPost === 0
      ? `${text}\n\n${rare.word}`
      : text
  }

  for (const [index, threadId] of threadIds.entries()) {
    const thread = threadRows[index] as (typeof threadRows)[number]
    const replies = random.int(scale.repliesPerThread[0], scale.repliesPerThread[1])

    for (let p = 0; p <= replies; p++) {
      const authorIndex = random.int(0, userIds.length - 1)
      batch.push({
        threadId,
        forumId: thread.forumId,
        authorUserId: userIds[authorIndex] as number,
        authorUsername: `user${authorIndex + 1}`,
        subject: p === 0 ? thread.title : null,
        message: body(paragraphs(random, random.int(1, 3))),
        isFirstPost: p === 0,
        /*
         * A hidden *post* is independent of its thread's state: a visible thread
         * routinely contains one held reply, which is the case the moderation
         * queue exists for and the case an all-visible corpus cannot produce.
         */
        visibility: visibilityFor(scale, generated),
        createdAt: thread.createdAt,
      })

      if (batch.length >= 500) await flush()
    }
  }

  /*
   * The long tail, appended after the uniform threads.
   *
   * Appended rather than interleaved so the random sequence for the first
   * `scale.threads` threads is byte-for-byte what it was before this option
   * existed. A board seeded without `longThreads` is unchanged, which is what
   * lets every existing budget assertion keep meaning what it meant.
   */
  if (scale.longThreads !== undefined) {
    const { count, posts: range } = scale.longThreads

    for (let i = 0; i < count; i++) {
      const authorIndex = random.int(0, userIds.length - 1)
      const createdAt = daysAgo(random.int(200, 900))
      const forumId = random.pick(forumIds)
      const title = `${words(random, 4)} archive ${i + 1}`

      const [inserted] = await db
        .insert(schema.threads)
        .values({
          forumId,
          title,
          slug: `archive-thread-${i + 1}`,
          authorUserId: userIds[authorIndex] as number,
          authorUsername: `user${authorIndex + 1}`,
          isSticky: false,
          isLocked: false,
          createdAt,
          lastPostAt: createdAt,
        })
        .returning({ id: schema.threads.id })

      const threadId = inserted?.id as number
      threadIds.push(threadId)

      const total = random.int(range[0], range[1])
      for (let p = 0; p < total; p++) {
        const poster = random.int(0, userIds.length - 1)
        batch.push({
          threadId,
          forumId,
          authorUserId: userIds[poster] as number,
          authorUsername: `user${poster + 1}`,
          subject: p === 0 ? title : null,
          message: body(paragraphs(random, random.int(1, 3))),
          isFirstPost: p === 0,
          createdAt,
        })

        if (batch.length >= 500) await flush()
      }
    }
  }

  await flush()

  return { threadIds, postCount }
}

/**
 * The visibility of the nth row.
 *
 * Deterministic on the counter rather than on `random`, so switching the option
 * on does not shift the pseudo-random sequence and every board seeded without it
 * is byte-for-byte what it was.
 */
function visibilityFor(scale: SeedScale, n: number): 'visible' | 'unapproved' | 'deleted' {
  const hidden = scale.hiddenContent
  if (hidden === undefined) return 'visible'
  if (n > 0 && n % hidden.deletedInN === 0) return 'deleted'
  if (n > 0 && n % hidden.unapprovedInN === 0) return 'unapproved'
  return 'visible'
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}
