/**
 * F60 — private messages against real Postgres.
 *
 * The service tests every rule without a database. What can only be proved here
 * is the SQL, and five claims of it:
 *
 *  - every read and write is **scoped by owner in the query**, so a copy id
 *    from somebody else's mailbox matches nothing;
 *  - a send writes the message and every copy in **one transaction**;
 *  - the unique index makes one member holding two copies of one message
 *    impossible, which is what the service's dedupe relies on;
 *  - a folder line's other participants come back in **one query**, with bcc
 *    hidden from everyone but the author;
 *  - deleting your copy leaves the message and everybody else's copy standing.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresMessageRepository } from './message-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresMessageRepository

const IVAN = 1
const BOB = 2
const CAROL = 3

const AT = new Date('2026-08-01T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresMessageRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from private_message_copies`)
  await db.execute(sql`delete from private_messages`)
  await db.execute(sql`delete from users`)

  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${IVAN}, 'ivan', 'ivan', 'ivan@example.test', 'ivan@example.test',
            'x', 'argon2id', 2),
           (${BOB}, 'bob', 'bob', 'bob@example.test', 'bob@example.test',
            'x', 'argon2id', 2),
           (${CAROL}, 'carol', 'carol', 'carol@example.test', 'carol@example.test',
            'x', 'argon2id', 2)
  `)
})

async function send(
  recipients: readonly { userId: number; bcc: boolean }[],
  overrides: Partial<{ subject: string; message: string; receiptRequested: boolean }> = {},
): Promise<number> {
  return repo.send({
    authorUserId: IVAN,
    authorUsername: 'ivan',
    subject: overrides.subject ?? 'Hello',
    message: overrides.message ?? 'A message.',
    messageHtml: '<p>A message.</p>',
    renderVersion: 1,
    vocabVersion: 0,
    replyToId: null,
    receiptRequested: overrides.receiptRequested ?? false,
    recipients,
    at: AT,
  })
}

async function copyIdFor(messageId: number, userId: number): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`
      select id from private_message_copies
       where message_id = ${messageId} and owner_user_id = ${userId}
    `),
  ) as Array<{ id: number }>
  return Number(rows[0]?.id)
}

describe('send', () => {
  it('writes the message once and a copy per participant', async () => {
    const id = await send([{ userId: BOB, bcc: false }, { userId: CAROL, bcc: false }])

    const messages = resultRows(
      await db.execute(sql`select count(*)::int as n from private_messages`),
    ) as Array<{ n: number }>
    expect(messages[0]?.n).toBe(1)

    const copies = resultRows(
      await db.execute(sql`
        select owner_user_id, folder, role, read_at
          from private_message_copies where message_id = ${id} order by id
      `),
    ) as Array<{ owner_user_id: number; folder: string; role: string; read_at: unknown }>

    expect(copies.map((c) => [Number(c.owner_user_id), c.folder, c.role])).toEqual([
      [IVAN, 'sent', 'author'],
      [BOB, 'inbox', 'to'],
      [CAROL, 'inbox', 'to'],
    ])
    /* The author's copy is read on arrival; a recipient's is not. */
    expect(copies[0]?.read_at).not.toBeNull()
    expect(copies[1]?.read_at).toBeNull()
  })

  it('rolls the whole send back when one copy cannot be written', async () => {
    /*
     * The transaction is what makes "all-or-nothing" true rather than intended.
     * A duplicate recipient violates the unique index mid-insert; the message
     * row must not survive it.
     */
    await expect(
      send([{ userId: BOB, bcc: false }, { userId: BOB, bcc: true }]),
    ).rejects.toThrow()

    const messages = resultRows(
      await db.execute(sql`select count(*)::int as n from private_messages`),
    ) as Array<{ n: number }>
    expect(messages[0]?.n).toBe(0)
  })

  it('stores the render with its version, so F36 can invalidate it', async () => {
    const id = await send([{ userId: BOB, bcc: false }])
    const message = await repo.forReport(id)
    expect(message?.messageHtml).toBe('<p>A message.</p>')
    expect(message?.renderVersion).toBe(1)
  })
})

describe('reads are scoped by owner', () => {
  it('returns a message only to somebody who holds a copy', async () => {
    const id = await send([{ userId: BOB, bcc: false }])

    expect(await repo.detail({ messageId: id, userId: BOB })).not.toBeNull()
    expect(await repo.detail({ messageId: id, userId: CAROL })).toBeNull()
  })

  it('lists only this member’s copies, in this folder', async () => {
    const id = await send([{ userId: BOB, bcc: false }])
    await repo.move({ userId: BOB, copyIds: [await copyIdFor(id, BOB)], folder: 'trash' })

    expect(await repo.list({ userId: BOB, folder: 'inbox', limit: 10 })).toEqual([])
    expect(await repo.list({ userId: BOB, folder: 'trash', limit: 10 })).toHaveLength(1)
    expect(await repo.list({ userId: IVAN, folder: 'sent', limit: 10 })).toHaveLength(1)
    expect(await repo.list({ userId: CAROL, folder: 'inbox', limit: 10 })).toEqual([])
  })

  it('pages backwards on the copy id without an offset', async () => {
    const first = await send([{ userId: BOB, bcc: false }], { subject: 'First' })
    await send([{ userId: BOB, bcc: false }], { subject: 'Second' })

    const page = await repo.list({ userId: BOB, folder: 'inbox', limit: 1 })
    expect(page[0]?.subject).toBe('Second')

    const next = await repo.list({
      userId: BOB,
      folder: 'inbox',
      limit: 1,
      before: page[0]?.copyId,
    })
    expect(next[0]?.subject).toBe('First')
    expect(next[0]?.messageId).toBe(first)
  })
})

describe('the counterparty column', () => {
  it('names the other people on the message, both ways round', async () => {
    await send([{ userId: BOB, bcc: false }, { userId: CAROL, bcc: false }])

    const [inbox] = await repo.list({ userId: BOB, folder: 'inbox', limit: 10 })
    expect(inbox?.counterparties).toEqual(['ivan', 'carol'])

    const [sent] = await repo.list({ userId: IVAN, folder: 'sent', limit: 10 })
    expect(sent?.counterparties).toEqual(['bob', 'carol'])
  })

  it('hides a bcc recipient from another recipient, and shows them to the author', async () => {
    /*
     * The leak the role column exists to prevent, proved in the SQL that a
     * listing path cannot forget — the alternative was filtering in the caller,
     * which is one refactor away from not happening.
     */
    await send([{ userId: BOB, bcc: false }, { userId: CAROL, bcc: true }])

    const [asBob] = await repo.list({ userId: BOB, folder: 'inbox', limit: 10 })
    expect(asBob?.counterparties).toEqual(['ivan'])
    expect(asBob?.moreCounterparties).toBe(0)

    const [asAuthor] = await repo.list({ userId: IVAN, folder: 'sent', limit: 10 })
    expect(asAuthor?.counterparties).toEqual(['bob', 'carol'])
  })

  it('counts the remainder rather than truncating a name', async () => {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (4, 'dave', 'dave', 'd@example.test', 'd@example.test', 'x', 'argon2id', 2),
             (5, 'erin', 'erin', 'e@example.test', 'e@example.test', 'x', 'argon2id', 2)
    `)
    await send([2, 3, 4, 5].map((userId) => ({ userId, bcc: false })))

    const [sent] = await repo.list({ userId: IVAN, folder: 'sent', limit: 10 })
    expect(sent?.counterparties).toHaveLength(3)
    expect(sent?.moreCounterparties).toBe(1)
  })
})

describe('counts', () => {
  it('counts each folder, the unread inbox, and everything stored', async () => {
    const first = await send([{ userId: BOB, bcc: false }])
    await send([{ userId: BOB, bcc: false }])
    await repo.setRead({ userId: BOB, copyIds: [await copyIdFor(first, BOB)], at: AT })

    const bob = await repo.counts(BOB)
    expect(bob).toEqual({ inbox: 2, sent: 0, trash: 0, unread: 1, stored: 2 })
  })

  it('counts trash as stored, which is what makes emptying it the remedy', async () => {
    const id = await send([{ userId: BOB, bcc: false }])
    await repo.move({ userId: BOB, copyIds: [await copyIdFor(id, BOB)], folder: 'trash' })

    const bob = await repo.counts(BOB)
    expect(bob.stored).toBe(1)
    expect(bob.inbox).toBe(0)
  })

  it('reports zero for a member with no messages rather than omitting them', async () => {
    expect(await repo.counts(CAROL)).toEqual({
      inbox: 0,
      sent: 0,
      trash: 0,
      unread: 0,
      stored: 0,
    })
    expect((await repo.storedCounts([CAROL])).get(CAROL)).toBeUndefined()
  })
})

describe('writes are scoped by owner', () => {
  it('will not move, mark or delete a copy belonging to somebody else', async () => {
    /*
     * The ids arrive from a form anybody can post. This is the property that
     * makes that safe, and it is in the `where` clause rather than in a check.
     */
    const id = await send([{ userId: BOB, bcc: false }])
    const bobs = await copyIdFor(id, BOB)

    expect(await repo.move({ userId: CAROL, copyIds: [bobs], folder: 'trash' })).toBe(0)
    expect(await repo.setRead({ userId: CAROL, copyIds: [bobs], at: AT })).toBe(0)
    expect(await repo.remove({ userId: CAROL, copyIds: [bobs] })).toBe(0)

    const detail = await repo.detail({ messageId: id, userId: BOB })
    expect(detail?.copy.folder).toBe('inbox')
    expect(detail?.copy.readAt).toBeNull()
  })

  it("deleting a copy leaves the message and everybody else's copy standing", async () => {
    const id = await send([{ userId: BOB, bcc: false }, { userId: CAROL, bcc: false }])

    expect(await repo.remove({ userId: BOB, copyIds: [await copyIdFor(id, BOB)] })).toBe(1)

    expect(await repo.detail({ messageId: id, userId: CAROL })).not.toBeNull()
    expect(await repo.forReport(id)).not.toBeNull()
  })

  it('empties one folder for one member only', async () => {
    const id = await send([{ userId: BOB, bcc: false }])
    await repo.move({ userId: BOB, copyIds: [await copyIdFor(id, BOB)], folder: 'trash' })

    expect(await repo.emptyFolder({ userId: BOB, folder: 'trash' })).toBe(1)
    expect((await repo.counts(IVAN)).sent).toBe(1)
  })

  it('does nothing at all when handed an empty selection', async () => {
    expect(await repo.move({ userId: BOB, copyIds: [], folder: 'trash' })).toBe(0)
    expect(await repo.setRead({ userId: BOB, copyIds: [], at: AT })).toBe(0)
    expect(await repo.remove({ userId: BOB, copyIds: [] })).toBe(0)
  })
})

describe('detail', () => {
  it('returns every participant with their read state, unfiltered', async () => {
    /*
     * Unfiltered on purpose: who the *viewer* may see is the service's
     * decision, and answering it here as well would be two answers to one
     * question.
     */
    const id = await send([{ userId: BOB, bcc: false }, { userId: CAROL, bcc: true }])
    await repo.setRead({ userId: BOB, copyIds: [await copyIdFor(id, BOB)], at: AT })

    const detail = await repo.detail({ messageId: id, userId: BOB })
    expect(detail?.participants.map((p) => [p.username, p.role, p.readAt !== null])).toEqual([
      ['ivan', 'author', true],
      ['bob', 'to', true],
      ['carol', 'bcc', false],
    ])
  })
})

describe('forReport', () => {
  it('returns a message to somebody who holds no copy of it', async () => {
    const id = await send([{ userId: BOB, bcc: false }])
    const message = await repo.forReport(id)
    expect(message?.subject).toBe('Hello')
    expect(message?.authorUsername).toBe('ivan')
  })

  it('returns null for a message that is not there', async () => {
    expect(await repo.forReport(4242)).toBeNull()
  })
})
