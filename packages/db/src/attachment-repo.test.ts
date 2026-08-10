import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresAttachmentRepository } from './attachment-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresAttachmentRepository

const ADA = 1
const FORUM = 1
let postId: number
let otherPostId: number

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresAttachmentRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from attachments`)
  await db.execute(sql`delete from attachment_orphans`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)

  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${ADA}, 'ada', 'ada', 'a@example.test', 'a@example.test', 'x', 'argon2id', 3)
  `)
  await db.execute(sql`
    insert into forums (id, type, title, slug, path)
    values (${FORUM}, 'forum', 'General', 'general', '/general')
  `)
  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username)
    values (1, ${FORUM}, 'Hello', 'hello', ${ADA}, 'ada')
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, is_first_post)
    values (1, 1, ${FORUM}, ${ADA}, 'ada', 'first', true),
           (2, 1, ${FORUM}, ${ADA}, 'ada', 'second', false)
  `)
  postId = 1
  otherPostId = 2
})

function pending(overrides: Partial<Parameters<typeof repo.create>[0]> = {}) {
  return repo.create({
    postId,
    forumId: FORUM,
    uploaderUserId: ADA,
    filename: 'photo.png',
    contentType: 'image/png',
    sizeBytes: 1024,
    sourceKey: 'attachments/a/source',
    storageKey: null,
    status: 'pending',
    ...overrides,
  })
}

describe('create', () => {
  it('stores a pending image with its source key and no storage key', async () => {
    const row = await pending()

    expect(row).toMatchObject({
      postId,
      forumId: FORUM,
      uploaderUserId: ADA,
      filename: 'photo.png',
      status: 'pending',
      sourceKey: 'attachments/a/source',
      storageKey: null,
      downloadCount: 0,
    })
  })

  it('stores an opaque file as ready, with a ready timestamp', async () => {
    const row = await pending({
      filename: 'notes.pdf',
      contentType: 'application/pdf',
      sourceKey: null,
      storageKey: 'attachments/b/file',
      status: 'ready',
    })

    expect(row.status).toBe('ready')
    const [raw] = resultRows(
      await db.execute(sql`select ready_at from attachments where id = ${row.id}`),
    ) as Array<{ ready_at: unknown }>
    expect(raw?.ready_at).not.toBeNull()
  })

  it('refuses two rows claiming the same object', async () => {
    await pending({ storageKey: 'attachments/x/file', sourceKey: null, status: 'ready' })
    await expect(
      pending({ storageKey: 'attachments/x/file', sourceKey: null, status: 'ready' }),
    ).rejects.toThrow()

    await pending({ sourceKey: 'attachments/y/source' })
    await expect(pending({ sourceKey: 'attachments/y/source' })).rejects.toThrow()
  })

  it('allows any number of rows with no key of a given kind', async () => {
    await pending({ sourceKey: 'attachments/1/source' })
    await pending({ sourceKey: 'attachments/2/source' })

    expect(await repo.countForPost(postId)).toBe(2)
  })

  it('goes with the post, by cascade', async () => {
    const row = await pending()
    await db.execute(sql`delete from posts where id = ${postId}`)

    expect(await repo.findById(row.id)).toBeNull()
  })

  it('survives the uploader being deleted', async () => {
    const row = await pending()
    await db.execute(sql`delete from users where id = ${ADA}`)

    const after = await repo.findById(row.id)
    expect(after?.uploaderUserId).toBeNull()
    expect(after?.filename).toBe('photo.png')
  })
})

describe('markReady', () => {
  it('swaps the two keys in one statement', async () => {
    const row = await pending()
    await repo.markReady(row.id, {
      storageKey: 'attachments/a/file',
      thumbnailKey: 'attachments/a/thumb',
      width: 800,
      height: 600,
      sizeBytes: 4096,
    })

    expect(await repo.findById(row.id)).toMatchObject({
      status: 'ready',
      storageKey: 'attachments/a/file',
      sourceKey: null,
      thumbnailKey: 'attachments/a/thumb',
      width: 800,
      height: 600,
      sizeBytes: 4096,
    })
  })

  it('does nothing to a row that is no longer pending', async () => {
    const row = await pending()
    const ready = {
      storageKey: 'attachments/a/file',
      thumbnailKey: null,
      width: 1,
      height: 1,
      sizeBytes: 1,
    }
    await repo.markReady(row.id, ready)
    await repo.markReady(row.id, { ...ready, storageKey: 'attachments/second/file' })

    expect((await repo.findById(row.id))?.storageKey).toBe('attachments/a/file')
  })
})

describe('markFailed', () => {
  it('records the reason and drops the source key', async () => {
    const row = await pending()
    await repo.markFailed(row.id, 'That image could not be read.')

    expect(await repo.findById(row.id)).toMatchObject({
      status: 'failed',
      failureReason: 'That image could not be read.',
      sourceKey: null,
      storageKey: null,
    })
  })

  it('cannot un-ready a row that already succeeded', async () => {
    const row = await pending()
    await repo.markReady(row.id, {
      storageKey: 'attachments/a/file',
      thumbnailKey: null,
      width: 1,
      height: 1,
      sizeBytes: 1,
    })
    await repo.markFailed(row.id, 'late')

    expect((await repo.findById(row.id))?.status).toBe('ready')
  })
})

describe('listForPosts', () => {
  it('answers a whole page of posts in one query, grouped and ordered', async () => {
    const first = await pending({ sourceKey: 'attachments/1/source' })
    const second = await pending({ sourceKey: 'attachments/2/source' })
    const other = await pending({ postId: otherPostId, sourceKey: 'attachments/3/source' })

    const rows = await repo.listForPosts([postId, otherPostId])
    expect(rows.map((r) => r.id)).toEqual([first.id, second.id, other.id])
  })

  it('is empty for no posts, without asking the database', async () => {
    expect(await repo.listForPosts([])).toEqual([])
  })

  it('returns nothing for a post with none', async () => {
    await pending()
    expect(await repo.listForPosts([otherPostId])).toEqual([])
  })
})

describe('recordDownload', () => {
  it('increments in the statement, so concurrent downloads both count', async () => {
    const row = await pending()
    await Promise.all([repo.recordDownload(row.id), repo.recordDownload(row.id)])

    expect((await repo.findById(row.id))?.downloadCount).toBe(2)
  })
})

describe('stalled', () => {
  it('finds pending rows older than the cutoff, oldest first', async () => {
    const old = await pending({ sourceKey: 'attachments/old/source' })
    await pending({ sourceKey: 'attachments/new/source' })
    await db.execute(
      sql`update attachments set created_at = now() - interval '2 hours' where id = ${old.id}`,
    )

    const found = await repo.stalled(new Date(Date.now() - 60 * 60_000), 10)
    expect(found.map((r) => r.id)).toEqual([old.id])
  })

  it('ignores rows that finished', async () => {
    const row = await pending()
    await repo.markReady(row.id, {
      storageKey: 'attachments/a/file',
      thumbnailKey: null,
      width: 1,
      height: 1,
      sizeBytes: 1,
    })
    await db.execute(sql`update attachments set created_at = now() - interval '2 hours'`)

    expect(await repo.stalled(new Date(), 10)).toEqual([])
  })
})

describe('the orphan ledger', () => {
  it('remembers a key and hands it back once it is stale', async () => {
    await repo.rememberKey('attachments/lost/file')
    await db.execute(sql`update attachment_orphans set created_at = now() - interval '2 hours'`)

    expect(await repo.staleKeys(new Date(Date.now() - 60 * 60_000), 10)).toEqual([
      'attachments/lost/file',
    ])
  })

  it('withholds a key that is still inside the grace period', async () => {
    await repo.rememberKey('attachments/fresh/file')
    expect(await repo.staleKeys(new Date(Date.now() - 60 * 60_000), 10)).toEqual([])
  })

  it('tolerates remembering the same key twice', async () => {
    await repo.rememberKey('attachments/same/file')
    await expect(repo.rememberKey('attachments/same/file')).resolves.toBeUndefined()
  })

  it('forgets keys in one statement, and tolerates an empty list', async () => {
    await repo.rememberKey('attachments/a/file')
    await repo.rememberKey('attachments/b/file')
    await repo.forgetKeys([])
    await repo.forgetKeys(['attachments/a/file', 'attachments/b/file'])
    await db.execute(sql`update attachment_orphans set created_at = now() - interval '2 hours'`)

    expect(await repo.staleKeys(new Date(), 10)).toEqual([])
  })
})

describe('reading a row back', () => {
  it('reads an unknown status as failed, which serves nothing', async () => {
    const row = await pending()
    await db.execute(sql`update attachments set status = 'weird' where id = ${row.id}`)

    expect((await repo.findById(row.id))?.status).toBe('failed')
  })
})
