/**
 * F42's storage, against real Postgres.
 *
 * What only the database settles:
 *
 *  - the two keys are swapped in one statement, so no row ever points at both
 *    the uploaded bytes and the safe ones;
 *  - every transition is guarded in its `where`, so an at-least-once queue
 *    delivering twice is a no-op rather than damage;
 *  - the partial unique indexes on the keys mean two rows can never claim the
 *    same object, while any number of rows may have no key at all;
 *  - the orphan ledger answers "which objects does nothing own" as an indexed
 *    query, which is the only cheap way to ask it.
 */
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
const COMMUNITY = 1
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
  await db.execute(sql`delete from communities`)
  await db.execute(sql`delete from users`)

  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${ADA}, 'ada', 'ada', 'a@example.test', 'a@example.test', 'x', 'argon2id', 3)
  `)
  await db.execute(sql`
    insert into communities (id, type, title, slug, path)
    values (${COMMUNITY}, 'community', 'General', 'general', '/general')
  `)
  await db.execute(sql`
    insert into threads (id, community_id, title, slug, author_user_id, author_username)
    values (1, ${COMMUNITY}, 'Hello', 'hello', ${ADA}, 'ada')
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, community_id, author_user_id, author_username,
                       message, is_first_post)
    values (1, 1, ${COMMUNITY}, ${ADA}, 'ada', 'first', true),
           (2, 1, ${COMMUNITY}, ${ADA}, 'ada', 'second', false)
  `)
  postId = 1
  otherPostId = 2
})

function pending(overrides: Partial<Parameters<typeof repo.create>[0]> = {}) {
  return repo.create({
    postId,
    communityId: COMMUNITY,
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
      communityId: COMMUNITY,
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
    /*
     * The partial unique indexes. Without them, deleting one row's object would
     * have to check whether another row points at it — a check somebody
     * eventually forgets.
     */
    await pending({ storageKey: 'attachments/x/file', sourceKey: null, status: 'ready' })
    await expect(
      pending({ storageKey: 'attachments/x/file', sourceKey: null, status: 'ready' }),
    ).rejects.toThrow()

    await pending({ sourceKey: 'attachments/y/source' })
    await expect(pending({ sourceKey: 'attachments/y/source' })).rejects.toThrow()
  })

  it('allows any number of rows with no key of a given kind', async () => {
    /* The indexes are partial for this reason: every ready row has a null
       source key, and a plain unique index would allow exactly one of them. */
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
    /*
     * SET NULL, not cascade: the attachment belongs to the post, and a member
     * closing their account must not silently strip images out of a thread
     * other people are reading.
     */
    const row = await pending()
    await db.execute(sql`delete from users where id = ${ADA}`)

    const after = await repo.findById(row.id)
    expect(after?.uploaderUserId).toBeNull()
    expect(after?.filename).toBe('photo.png')
  })
})

describe('markReady', () => {
  it('swaps the two keys in one statement', async () => {
    /*
     * The claim: no row ever points at both the uploaded bytes and the safe
     * ones. Kills the mutant that sets `storage_key` and leaves `source_key`,
     * which would keep the hostile file reachable and unswept.
     */
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
    /*
     * The queue is at-least-once, so a second delivery is expected. Kills the
     * mutant that drops the `status = 'pending'` guard, which on redelivery
     * would publish a second object and leak the first.
     */
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
    /* The reason is shown to the uploader, not just logged: "your image could
       not be processed" with no reason is a bug report nobody can act on. */
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
    /*
     * Kills the mutant that reads the row and writes back `count + 1`: two
     * downloads landing together would record one.
     */
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
    /* A retried upload may reuse a key it already remembered, and failing there
       would be a failed upload for a reason unrelated to the file. */
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
    /*
     * The column is text and a row written by a previous deploy could hold
     * anything. Defaulting to `ready` would serve an object whose processing
     * state is unknown; `failed` is the one value that cannot.
     */
    const row = await pending()
    await db.execute(sql`update attachments set status = 'weird' where id = ${row.id}`)

    expect((await repo.findById(row.id))?.status).toBe('failed')
  })
})
