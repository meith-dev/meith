import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PostgresAvatarRepository } from './avatar-repo'
import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresAvatarRepository

const ADA = 1
const BOB = 2
const AT = new Date('2026-08-02T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresAvatarRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from attachment_orphans`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${ADA}, 'ada', 'ada', 'a@example.test', 'a@example.test', 'x', 'argon2id', 2),
           (${BOB}, 'bob', 'bob', 'b@example.test', 'b@example.test', 'x', 'argon2id', 2)
  `)
})

describe('find', () => {
  it('reads the never-uploaded state as a value, not an absence', async () => {
    expect(await repo.find(ADA)).toMatchObject({
      status: 'none',
      key: null,
      sourceKey: null,
      locked: false,
    })
  })

  it('returns null for a member who does not exist', async () => {
    expect(await repo.find(999)).toBeNull()
  })

  it('reads an unknown status as failed, which serves nothing', async () => {
    await db.execute(sql`update users set avatar_status = 'weird' where id = ${ADA}`)
    expect((await repo.find(ADA))?.status).toBe('failed')
  })
})

describe('beginUpload', () => {
  it('points the row at the new upload and reports nothing replaced', async () => {
    const { replaced } = await repo.beginUpload({
      userId: ADA,
      sourceKey: 'attachments/a/source',
      at: AT,
    })

    expect(replaced).toEqual([])
    expect(await repo.find(ADA)).toMatchObject({
      status: 'pending',
      sourceKey: 'attachments/a/source',
      key: null,
      updatedAt: AT,
    })
  })

  it('reports the object it replaced, in the statement that replaced it', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/first/source', at: AT })
    await repo.markReady({ userId: ADA, key: 'attachments/first/file', width: 200, height: 200 })

    const { replaced } = await repo.beginUpload({
      userId: ADA,
      sourceKey: 'attachments/second/source',
      at: AT,
    })

    expect(replaced).toEqual(['attachments/first/file'])
  })

  it('reports an abandoned source as well as a published one', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/first/source', at: AT })
    const { replaced } = await repo.beginUpload({
      userId: ADA,
      sourceKey: 'attachments/second/source',
      at: AT,
    })

    expect(replaced).toEqual(['attachments/first/source'])
  })

  it('is refused by the lock, and reports the new object as the one to collect', async () => {
    await repo.lock({ userId: ADA, locked: true, reason: 'no' })

    const { replaced } = await repo.beginUpload({
      userId: ADA,
      sourceKey: 'attachments/new/source',
      at: AT,
    })

    expect(replaced).toEqual(['attachments/new/source'])
    expect(await repo.find(ADA)).toMatchObject({ status: 'none', sourceKey: null })
  })

  it('clears a previous failure, so a retry is not shown the old reason', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.markFailed(ADA, 'That image could not be read.')
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/b/source', at: AT })

    expect((await repo.find(ADA))?.failureReason).toBeNull()
  })
})

describe('markReady', () => {
  it('swaps both keys in one statement', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.markReady({ userId: ADA, key: 'attachments/a/file', width: 200, height: 150 })

    expect(await repo.find(ADA)).toMatchObject({
      status: 'ready',
      key: 'attachments/a/file',
      sourceKey: null,
      width: 200,
      height: 150,
    })
  })

  it('does nothing to a row that is no longer pending', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.markReady({ userId: ADA, key: 'attachments/a/file', width: 1, height: 1 })
    await repo.markReady({ userId: ADA, key: 'attachments/second/file', width: 1, height: 1 })

    expect((await repo.find(ADA))?.key).toBe('attachments/a/file')
  })

  it('refuses two members claiming one object', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.markReady({ userId: ADA, key: 'attachments/shared/file', width: 1, height: 1 })
    await repo.beginUpload({ userId: BOB, sourceKey: 'attachments/b/source', at: AT })

    await expect(
      repo.markReady({ userId: BOB, key: 'attachments/shared/file', width: 1, height: 1 }),
    ).rejects.toThrow()
  })

  it('lets every member have no avatar at once', async () => {
    expect((await repo.find(ADA))?.key).toBeNull()
    expect((await repo.find(BOB))?.key).toBeNull()
  })
})

describe('clear', () => {
  it('resets the row and reports what to collect', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.markReady({ userId: ADA, key: 'attachments/a/file', width: 1, height: 1 })

    const { replaced } = await repo.clear(ADA)

    expect(replaced).toEqual(['attachments/a/file'])
    expect(await repo.find(ADA)).toMatchObject({ status: 'none', key: null, updatedAt: null })
  })

  it('is refused by the lock and collects nothing', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.markReady({ userId: ADA, key: 'attachments/a/file', width: 1, height: 1 })
    await repo.lock({ userId: ADA, locked: true, reason: 'no' })

    expect(await repo.clear(ADA)).toEqual({ replaced: [] })
    expect((await repo.find(ADA))?.key).toBe('attachments/a/file')
  })
})

describe('the lock', () => {
  it('keeps the object, so an appeal has something to look at', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.markReady({ userId: ADA, key: 'attachments/a/file', width: 1, height: 1 })
    await repo.lock({ userId: ADA, locked: true, reason: 'not suitable' })

    expect(await repo.find(ADA)).toMatchObject({
      locked: true,
      lockedReason: 'not suitable',
      key: 'attachments/a/file',
      status: 'ready',
    })
  })

  it('unlocks and clears the reason', async () => {
    await repo.lock({ userId: ADA, locked: true, reason: 'no' })
    await repo.lock({ userId: ADA, locked: false, reason: null })

    expect(await repo.find(ADA)).toMatchObject({ locked: false, lockedReason: null })
  })
})

describe('readMany', () => {
  it('answers a page of postbits in one query', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.markReady({ userId: ADA, key: 'attachments/a/file', width: 1, height: 1 })

    const found = await repo.readMany([ADA, BOB])
    expect(found.get(ADA)?.key).toBe('attachments/a/file')
    expect(found.get(BOB)?.status).toBe('none')
  })

  it('is empty for no ids, without asking the database', async () => {
    expect((await repo.readMany([])).size).toBe(0)
  })
})

describe('stalled', () => {
  it('finds pending uploads older than the cutoff', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.beginUpload({ userId: BOB, sourceKey: 'attachments/b/source', at: new Date() })

    expect(await repo.stalled(new Date(AT.getTime() + 60_000), 10)).toEqual([ADA])
  })

  it('ignores a member whose upload finished', async () => {
    await repo.beginUpload({ userId: ADA, sourceKey: 'attachments/a/source', at: AT })
    await repo.markReady({ userId: ADA, key: 'attachments/a/file', width: 1, height: 1 })

    expect(await repo.stalled(new Date(), 10)).toEqual([])
  })
})

describe('the object ledger', () => {
  it('is the one attachment uploads use, and tolerates the same key twice', async () => {
    await repo.rememberKey('attachments/x/file')
    await expect(repo.rememberKey('attachments/x/file')).resolves.toBeUndefined()

    const count = async () =>
      (
        resultRows(
          await db.execute(sql`select count(*)::int as n from attachment_orphans`),
        ) as Array<{ n: number }>
      )[0]?.n

    expect(await count()).toBe(1)

    await repo.forgetKeys(['attachments/x/file'])
    expect(await count()).toBe(0)
  })
})
