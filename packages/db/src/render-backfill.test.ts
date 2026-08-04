/**
 * F36 — the render cache against real Postgres.
 *
 * Three things are only true in the database and would be waved through by a
 * mock: that a written post carries its render, that the backfill's predicate
 * actually selects stale rows, and that a batched `update … from (values …)`
 * writes each post its *own* HTML rather than the last row's to all of them.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { RENDER_VERSION, renderBBCode } from '@meith/bbcode'
import { expectQueryBudget } from '@meith/testkit'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresContentAdminRepository } from './content-admin-repo'
import { PostgresRenderBackfill } from './render-backfill'
import { resultRows } from './result-rows'
import { PostgresThreadWriteRepository } from './thread-writes'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let backfill: PostgresRenderBackfill

const CATEGORY = 1
const FORUM = 4
const AT = new Date('2026-07-30T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  backfill = new PostgresRenderBackfill(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from content_counter_rollups`)
  await db.execute(sql`delete from outbox`)
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
})

/** A post written straight to the table, as an import or an old release left it. */
async function insertStale(id: number, message: string): Promise<void> {
  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username,
                         visibility, last_post_at, created_at, updated_at)
    values (${id}, ${FORUM}, ${'T' + String(id)}, ${'t' + String(id)}, 1, 'ada',
            'visible', ${AT}, ${AT}, ${AT})
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility, is_first_post, created_at)
    values (${id}, ${id}, ${FORUM}, 1, 'ada', ${message}, 'visible', true, ${AT})
  `)
}

async function readPost(id: number): Promise<{ html: string | null; version: number }> {
  const rows = resultRows(
    await db.execute(sql`
      select message_html, render_version from posts where id = ${id}
    `),
  ) as Array<{ message_html: string | null; render_version: number }>
  const row = rows[0]!
  return { html: row.message_html, version: Number(row.render_version) }
}

describe('the stored render', () => {
  it('is written by the same transaction as the post', async () => {
    const repo = new PostgresThreadWriteRepository(db)
    const created = await repo.create({
      forumId: FORUM,
      title: 'Hello there',
      slug: 'hello-there',
      message: 'a [b]bold[/b] claim',
      prefixId: null,
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
      subscribe: false,
      createdAt: AT,
    })

    expect(await readPost(created.postId)).toEqual({
      html: 'a <strong>bold</strong> claim',
      version: RENDER_VERSION,
    })
  })

  it('is written for a reply too', async () => {
    const repo = new PostgresThreadWriteRepository(db)
    const thread = await repo.create({
      forumId: FORUM,
      title: 'Hello there',
      slug: 'hello-there',
      message: 'opening',
      prefixId: null,
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
      subscribe: false,
      createdAt: AT,
    })
    const { postId } = await repo.createReply({
      threadId: thread.threadId,
      forumId: FORUM,
      threadTitle: 'Hello there',
      message: '[quote]opening[/quote]agreed',
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
      subscribe: false,
      createdAt: AT,
    })

    const stored = await readPost(postId)
    expect(stored.version).toBe(RENDER_VERSION)
    expect(stored.html).toContain('<blockquote class="bb-quote">opening</blockquote>')
  })
})

describe('PostgresRenderBackfill', () => {
  it('renders rows an older release left behind', async () => {
    await insertStale(10, 'plain')
    await insertStale(11, '[b]bold[/b]')

    expect(await backfill.pending()).toBe(2)
    expect(await backfill.run(50)).toEqual({ rendered: 2 })

    expect(await readPost(10)).toEqual({ html: 'plain', version: RENDER_VERSION })
    expect(await readPost(11)).toEqual({
      html: '<strong>bold</strong>',
      version: RENDER_VERSION,
    })
    expect(await backfill.pending()).toBe(0)
  })

  /*
   * The mistake a batched `update … from (values …)` invites: joining on the
   * wrong column, or building one value row, gives every post the same body.
   * Distinct messages are the only way to see it.
   */
  it('gives each post its own render, not the last one in the batch', async () => {
    for (let id = 20; id < 26; id += 1) await insertStale(id, `[b]${id}[/b]`)

    await backfill.run(10)

    for (let id = 20; id < 26; id += 1) {
      expect(await readPost(id)).toEqual({
        html: `<strong>${id}</strong>`,
        version: RENDER_VERSION,
      })
    }
  })

  it('is bounded by the batch size and resumes on the next run', async () => {
    for (let id = 30; id < 35; id += 1) await insertStale(id, 'x')

    expect(await backfill.run(2)).toEqual({ rendered: 2 })
    expect(await backfill.pending()).toBe(3)
    expect(await backfill.run(2)).toEqual({ rendered: 2 })
    expect(await backfill.run(2)).toEqual({ rendered: 1 })
    expect(await backfill.run(2)).toEqual({ rendered: 0 })
  })

  it('does nothing on a board that is already current', async () => {
    await insertStale(40, 'x')
    await backfill.run(10)

    const before = await readPost(40)
    expect(await backfill.run(10)).toEqual({ rendered: 0 })
    expect(await readPost(40)).toEqual(before)
  })

  /*
   * The whole point of storing the version. Bumping it must make every row
   * stale without touching the database — that is what lets an escaping fix
   * take effect on deploy rather than after a migration over 2M rows.
   */
  it('treats a version bump as invalidating every stored render', async () => {
    await insertStale(50, 'x')
    await backfill.run(10)
    expect(await backfill.pending()).toBe(0)

    await db.execute(sql`update posts set render_version = ${RENDER_VERSION + 1}`)
    expect(await backfill.pending()).toBe(1)

    /* And a *newer* version is stale too — a rollback must re-render, not trust. */
    await backfill.run(10)
    expect(await readPost(50)).toEqual({
      html: renderBBCode('x').html,
      version: RENDER_VERSION,
    })
  })

  /*
   * One select and one update, whatever the batch holds. A per-post update is
   * the obvious implementation and the one that turns a 200-post batch into 201
   * round trips — invisible in a correctness test, fatal on a pooled serverless
   * connection.
   */
  it('costs two statements regardless of batch size', async () => {
    for (let id = 60; id < 70; id += 1) await insertStale(id, 'x')

    await expectQueryBudget(harness, 2, () => backfill.run(10))
  })
})

/**
 * F71 — the board's vocabulary is the second half of "which renderer made
 * this", so all three of these are new behaviour rather than restatements.
 */
describe('the board vocabulary', () => {
  beforeEach(async () => {
    await db.execute(sql`delete from smilies`)
    await db.execute(sql`delete from custom_bbcode`)
    await db.execute(sql`delete from cache_versions where key = 'bbcode_vocabulary'`)
  })

  async function addSmiley(): Promise<number> {
    await new PostgresContentAdminRepository(db).createSmiley({
      code: ':)',
      src: '/smilies/smile.png',
      alt: null,
    })
    return new PostgresContentAdminRepository(db).vocabularyRevision()
  }

  async function readStamps(id: number): Promise<{ html: string | null; vocab: number }> {
    const rows = resultRows(
      await db.execute(sql`select message_html, vocab_version from posts where id = ${id}`),
    ) as Array<{ message_html: string | null; vocab_version: number }>
    const row = rows[0]!
    return { html: row.message_html, vocab: Number(row.vocab_version) }
  }

  /*
   * The write path renders with the vocabulary rather than leaving it to the
   * backfill. Otherwise the newest posts — the ones people are reading — would
   * be exactly the ones rendering live on every request.
   */
  it('is applied by the write path, and stamped with the render', async () => {
    const revision = await addSmiley()

    const created = await new PostgresThreadWriteRepository(db).create({
      forumId: FORUM,
      title: 'Hello there',
      slug: 'hello-there',
      message: 'hi :)',
      prefixId: null,
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
      subscribe: false,
      createdAt: AT,
    })

    const post = await readStamps(created.postId)
    expect(post.html).toContain('/smilies/smile.png')
    expect(post.vocab).toBe(revision)
  })

  /*
   * The point of the column. A post written before the smiley existed has HTML
   * that does not contain it, and serving that would make the new smiley appear
   * only on posts written since — which looks exactly like a broken feature.
   */
  it('makes an existing render stale, and the backfill rewrites it', async () => {
    await insertStale(50, 'hi :)')
    await backfill.run(10)
    expect((await readStamps(50)).html).not.toContain('/smilies/smile.png')

    const revision = await addSmiley()
    expect(await backfill.pending()).toBe(1)

    await backfill.run(10)

    const post = await readStamps(50)
    expect(post.html).toContain('/smilies/smile.png')
    expect(post.vocab).toBe(revision)
    expect(await backfill.pending()).toBe(0)
  })

  it('rewrites again when the vocabulary is removed, restoring the literal code', async () => {
    const smileyId = await new PostgresContentAdminRepository(db).createSmiley({
      code: ':)',
      src: '/smilies/smile.png',
      alt: null,
    })
    await insertStale(51, 'hi :)')
    await backfill.run(10)
    expect((await readStamps(51)).html).toContain('/smilies/smile.png')

    await new PostgresContentAdminRepository(db).deleteSmiley(smileyId)
    await backfill.run(10)

    const post = await readStamps(51)
    expect(post.html).not.toContain('/smilies/smile.png')
    expect(post.html).toContain(':)')
  })
})
