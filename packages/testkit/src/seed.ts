import { eq } from 'drizzle-orm'

import { type Database, schema } from '@meith/db'

import { createRandom, paragraphs, type Random, words } from './random'

export interface SeedScale {
  readonly users: number
  readonly categories: number
  readonly forums: number
  readonly threads: number
  readonly repliesPerThread: readonly [number, number]
  readonly longThreads?: {
    readonly count: number
    readonly posts: readonly [number, number]
  }
  readonly rareTerm?: {
    readonly word: string
    readonly everyNthPost: number
  }
  readonly hiddenContent?: {
    readonly unapprovedInN: number
    readonly deletedInN: number
  }
}

export const SMOKE_SCALE: SeedScale = {
  users: 40,
  categories: 3,
  forums: 12,
  threads: 120,
  repliesPerThread: [0, 6],
}

export const FULL_SCALE: SeedScale = {
  users: 20_000,
  categories: 6,
  forums: 50,
  threads: 100_000,
  repliesPerThread: [10, 30],
  longThreads: { count: 30, posts: [2_000, 15_000] },
  rareTerm: { word: 'quinsyflange', everyNthPost: 1_999 },
  hiddenContent: { unapprovedInN: 50, deletedInN: 100 },
}

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

async function inBatches<T>(
  rows: readonly T[],
  size: number,
  write: (batch: readonly T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await write(rows.slice(i, i + size))
  }
}

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
    const parentId =
      forumIds.length > 0 && random.chance(0.25) ? random.pick(forumIds) : random.pick(categoryIds)

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

  let batch: (typeof schema.posts.$inferInsert)[] = []
  let postCount = 0
  let generated = 0

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return
    await db.insert(schema.posts).values(batch)
    postCount += batch.length
    batch = []
  }

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
        visibility: visibilityFor(scale, generated),
        createdAt: thread.createdAt,
      })

      if (batch.length >= 500) await flush()
    }
  }

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
