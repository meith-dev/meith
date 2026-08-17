import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PostgresAttachmentAdminRepository } from './attachment-admin-repo'
import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresAttachmentAdminRepository

const CATEGORY = 1
const FORUM = 4
const AT = new Date('2026-07-30T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresAttachmentAdminRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from attachment_orphans`)
  await db.execute(sql`delete from attachments`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values({
    id: 1,
    username: 'ada',
    usernameLower: 'ada',
    email: 'ada@example.test',
    emailLower: 'ada@example.test',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: 2,
  })
  await db.insert(forums).values([
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: FORUM, title: 'General', slug: 'general', path: '1.4', depth: 1, parentId: CATEGORY },
  ])
  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username,
                         visibility, last_post_at, created_at, updated_at)
    values (1, ${FORUM}, 'A thread', 'a-thread', 1, 'ada', 'visible', ${AT}, ${AT}, ${AT})
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility, is_first_post, created_at)
    values (1, 1, ${FORUM}, 1, 'ada', 'hello', 'visible', true, ${AT})
  `)
})

async function addAttachment(input: {
  id: number
  filename: string
  status?: string
  sizeBytes?: number
  keys?: { storage?: string | null; source?: string | null; thumbnail?: string | null }
}): Promise<void> {
  await db.execute(sql`
    insert into attachments (id, post_id, forum_id, uploader_user_id, filename,
                             content_type, size_bytes, storage_key, source_key,
                             thumbnail_key, status, created_at)
    values (${input.id}, 1, ${FORUM}, 1, ${input.filename}, 'image/png',
            ${input.sizeBytes ?? 1024},
            ${input.keys?.storage ?? null}, ${input.keys?.source ?? null},
            ${input.keys?.thumbnail ?? null},
            ${input.status ?? 'ready'}, ${AT})
  `)
}

async function orphanKeys(): Promise<string[]> {
  const rows = resultRows(
    await db.execute(sql`select storage_key from attachment_orphans order by storage_key`),
  ) as Array<{ storage_key: string }>
  return rows.map((row) => row.storage_key)
}

describe('listing', () => {
  it('returns the newest first, with the uploader and the thread', async () => {
    await addAttachment({ id: 1, filename: 'one.png' })
    await addAttachment({ id: 2, filename: 'two.png' })

    const page = await repo.list({ limit: 10 })
    expect(page.rows.map((row) => row.id)).toEqual([2, 1])
    expect(page.rows[0]).toMatchObject({
      uploaderUsername: 'ada',
      threadSlug: 'a-thread',
      postId: 1,
    })
  })

  it('pages by keyset, so a delete cannot make the next page skip a row', async () => {
    for (let id = 1; id <= 5; id += 1) await addAttachment({ id, filename: `f${id}.png` })

    const first = await repo.list({ limit: 2 })
    expect(first.rows.map((row) => row.id)).toEqual([5, 4])
    expect(first.nextBeforeId).toBe(4)

    const second = await repo.list({ limit: 2, beforeId: first.nextBeforeId as number })
    expect(second.rows.map((row) => row.id)).toEqual([3, 2])
  })

  it('pages by number, and counts what the filter matched', async () => {
    for (let id = 1; id <= 5; id += 1) await addAttachment({ id, filename: `f${id}.png` })

    const second = await repo.list({ limit: 2, offset: 2 })
    expect(second.rows.map((row) => row.id)).toEqual([3, 2])
    expect(second.total).toBe(5)
  })

  it('counts the filter rather than the table', async () => {
    await addAttachment({ id: 1, filename: 'ok.png' })
    await addAttachment({ id: 2, filename: 'broken.png', status: 'failed' })

    expect((await repo.list({ limit: 10, status: 'failed' })).total).toBe(1)
  })

  it('reports no cursor on the last page', async () => {
    await addAttachment({ id: 1, filename: 'only.png' })
    expect((await repo.list({ limit: 10 })).nextBeforeId).toBeNull()
  })

  it('filters by status', async () => {
    await addAttachment({ id: 1, filename: 'ok.png' })
    await addAttachment({ id: 2, filename: 'broken.png', status: 'failed' })

    const page = await repo.list({ limit: 10, status: 'failed' })
    expect(page.rows.map((row) => row.filename)).toEqual(['broken.png'])
  })

  it('ignores a status that is not one of the three, rather than refusing', async () => {
    await addAttachment({ id: 1, filename: 'ok.png' })
    expect((await repo.list({ limit: 10, status: 'nonsense' })).rows).toHaveLength(1)
  })

  it('escapes wildcards in the filename filter', async () => {
    await addAttachment({ id: 1, filename: '100%.png' })
    await addAttachment({ id: 2, filename: 'holiday.png' })

    const page = await repo.list({ limit: 10, filename: '100%' })
    expect(page.rows.map((row) => row.filename)).toEqual(['100%.png'])
  })

  it('matches case-insensitively', async () => {
    await addAttachment({ id: 1, filename: 'Holiday.PNG' })
    expect((await repo.list({ limit: 10, filename: 'holiday' })).rows).toHaveLength(1)
  })
})

describe('totals', () => {
  it('counts the board and separates what an operator can act on', async () => {
    await addAttachment({ id: 1, filename: 'a.png', sizeBytes: 1000 })
    await addAttachment({ id: 2, filename: 'b.png', sizeBytes: 2000, status: 'pending' })
    await addAttachment({ id: 3, filename: 'c.png', sizeBytes: 3000, status: 'failed' })

    expect(await repo.totals()).toEqual({ count: 3, bytes: 6000, pending: 1, failed: 1 })
  })

  it('is zeroes on an empty board rather than nulls', async () => {
    expect(await repo.totals()).toEqual({ count: 0, bytes: 0, pending: 0, failed: 0 })
  })
})

describe('deleting', () => {
  it('hands every stored key to the sweep', async () => {
    await addAttachment({
      id: 1,
      filename: 'a.png',
      keys: { storage: 'ready/1', source: 'src/1', thumbnail: 'thumb/1' },
    })

    expect(await repo.delete(1)).toBe(true)
    expect(await orphanKeys()).toEqual(['ready/1', 'src/1', 'thumb/1'])
  })

  it('orphans only the keys that exist', async () => {
    await addAttachment({ id: 1, filename: 'a.png', keys: { source: 'src/1' } })

    await repo.delete(1)
    expect(await orphanKeys()).toEqual(['src/1'])
  })

  it('leaves the post exactly as it was', async () => {
    await addAttachment({ id: 1, filename: 'a.png', keys: { storage: 'ready/1' } })
    await repo.delete(1)

    const rows = resultRows(
      await db.execute(sql`select message from posts where id = 1`),
    ) as Array<{ message: string }>
    expect(rows[0]?.message).toBe('hello')
  })

  it('reports an id that is not there rather than claiming success', async () => {
    expect(await repo.delete(999)).toBe(false)
  })

  it('is idempotent under a double submit', async () => {
    await addAttachment({ id: 1, filename: 'a.png', keys: { storage: 'ready/1' } })

    expect(await repo.delete(1)).toBe(true)
    expect(await repo.delete(1)).toBe(false)
    expect(await orphanKeys()).toEqual(['ready/1'])
  })
})
