import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PUBLIC_CONTENT } from '@meith/core'
import { RENDER_VERSION } from '@meith/markdown'

import type { Database } from './client'
import { rollUpAncestorCounters } from './content-counters'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresPostWriteRepository } from './post-writes'
import { resultRows } from './result-rows'
import { forums, users } from './schema'
import { PostgresSearchRepository } from './search-repo'
import { PostgresThreadWriteRepository } from './thread-writes'
import { applyAncestorVisibilityChange } from './visibility-counters'

let harness: TestDb
let db: Database
let repo: PostgresPostWriteRepository
let threads: PostgresThreadWriteRepository

const CATEGORY = 1
const FORUM = 4
const CHILD = 5
const AUTHOR = 1
const MOD = 2

const AT = new Date('2026-07-30T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresPostWriteRepository(db)
  threads = new PostgresThreadWriteRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from admin_log`)
  await db.execute(sql`delete from post_revisions`)
  await db.execute(sql`delete from thread_subscriptions`)
  await db.execute(sql`delete from content_counter_rollups`)
  await db.execute(sql`delete from outbox`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values(
    [
      [AUTHOR, 'ada'],
      [MOD, 'mod'],
    ].map(([id, name]) => ({
      id: id as number,
      username: name as string,
      usernameLower: name as string,
      email: `${String(name)}@example.test`,
      emailLower: `${String(name)}@example.test`,
      passwordHash: 'x',
      passwordAlgo: 'argon2id',
      primaryGroupId: 2,
    })),
  )
  await db.insert(forums).values([
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: FORUM, title: 'General', slug: 'general', path: '1.4', depth: 1, parentId: CATEGORY },
    { id: CHILD, title: 'Nested', slug: 'nested', path: '1.4.5', depth: 2, parentId: FORUM },
  ])
})

async function seedThread(
  forumId = FORUM,
  replies = 1,
  at = AT,
): Promise<{ threadId: number; postIds: number[] }> {
  const thread = await threads.create({
    forumId,
    title: 'Hello there',
    slug: 'hello-there',
    message: 'the opening post',
    prefixId: null,
    authorUserId: AUTHOR,
    authorUsername: 'ada',
    visibility: 'visible',
    subscribe: false,
    createdAt: at,
  })

  const postIds = [thread.postId]
  for (let n = 0; n < replies; n += 1) {
    const { postId } = await threads.createReply({
      threadId: thread.threadId,
      forumId,
      threadTitle: 'Hello there',
      message: `reply ${n}`,
      authorUserId: AUTHOR,
      authorUsername: 'ada',
      visibility: 'visible',
      subscribe: false,
      createdAt: new Date(at.getTime() + (n + 1) * 60_000),
    })
    postIds.push(postId)
  }

  for (const postId of postIds) await rollUpAncestorCounters(db, postId)

  return { threadId: thread.threadId, postIds }
}

async function forumRow(id: number): Promise<{
  post_count: number
  thread_count: number
  last_post_id: number | null
}> {
  const rows = resultRows(
    await db.execute(sql`
      select post_count, thread_count, last_post_id from forums where id = ${id}
    `),
  ) as Array<{ post_count: number; thread_count: number; last_post_id: number | null }>
  const row = rows[0]!
  return {
    post_count: Number(row.post_count),
    thread_count: Number(row.thread_count),
    last_post_id: row.last_post_id === null ? null : Number(row.last_post_id),
  }
}

async function threadRow(id: number): Promise<{
  reply_count: number
  last_post_id: number | null
}> {
  const rows = resultRows(
    await db.execute(sql`select reply_count, last_post_id from threads where id = ${id}`),
  ) as Array<{ reply_count: number; last_post_id: number | null }>
  const row = rows[0]!
  return {
    reply_count: Number(row.reply_count),
    last_post_id: row.last_post_id === null ? null : Number(row.last_post_id),
  }
}

async function userPostCount(): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select post_count from users where id = ${AUTHOR}`),
  ) as Array<{ post_count: number }>
  return Number(rows[0]!.post_count)
}

async function postRow(id: number): Promise<{
  message: string
  message_html: string | null
  render_version: number
  visibility: string
  revision_count: number
  edit_reason: string | null
  edited_at: Date | null
  edited_by_user_id: number | null
}> {
  const rows = resultRows(
    await db.execute(sql`
      select message, message_html, render_version, visibility, revision_count,
             edit_reason, edited_at, edited_by_user_id
        from posts where id = ${id}
    `),
  ) as Array<{
    message: string
    message_html: string | null
    render_version: number
    visibility: string
    revision_count: number
    edit_reason: string | null
    edited_at: Date | null
    edited_by_user_id: number | null
  }>
  return { ...rows[0]!, render_version: Number(rows[0]!.render_version) }
}

describe('findEditTarget', () => {
  it('returns the post with its thread and forum', async () => {
    const { threadId, postIds } = await seedThread()
    const target = await repo.findEditTarget(threadId, postIds[1]!)

    expect(target).toMatchObject({
      post: { id: postIds[1], message: 'reply 0', visibility: 'visible', isFirstPost: false },
      thread: { id: threadId, slug: 'hello-there', isLocked: false },
      forum: { id: FORUM, slug: 'general', isOpen: true },
    })
  })

  it('refuses a post that is not in the given thread', async () => {
    const { postIds } = await seedThread()
    expect(await repo.findEditTarget(9999, postIds[1]!)).toBeNull()
  })
})

describe('applyEdit', () => {
  const edit = (postId: number, threadId: number, overrides = {}) => ({
    postId,
    threadId,
    forumId: FORUM,
    authorUserId: AUTHOR,
    isFirstPost: false,
    message: 'a **revised** body',
    reason: 'typo',
    editedByUserId: AUTHOR,
    editedAt: new Date('2026-07-30T13:00:00Z'),
    silent: false,
    previousMessage: 'reply 0',
    previousSubject: null,
    revision: 1,
    fromVisibility: 'visible' as const,
    toVisibility: 'visible' as const,
    ...overrides,
  })

  it('stores the previous body as a revision and the new one on the post', async () => {
    const { threadId, postIds } = await seedThread()
    await repo.applyEdit(edit(postIds[1]!, threadId))

    const revisions = resultRows(
      await db.execute(sql`
        select revision, message, edit_reason from post_revisions where post_id = ${postIds[1]!}
      `),
    ) as Array<{ revision: number; message: string; edit_reason: string | null }>

    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({ revision: 1, message: 'reply 0', edit_reason: 'typo' })
    expect(await postRow(postIds[1]!)).toMatchObject({
      message: 'a **revised** body',
      revision_count: 1,
      edit_reason: 'typo',
      edited_by_user_id: AUTHOR,
    })
  })

  it('rewrites the stored render with the message', async () => {
    const { threadId, postIds } = await seedThread()
    await repo.applyEdit(edit(postIds[1]!, threadId))

    expect(await postRow(postIds[1]!)).toMatchObject({
      message_html: '<p>a <strong>revised</strong> body</p>',
      render_version: RENDER_VERSION,
    })
  })

  it('moves no counter when the post stays visible', async () => {
    const { threadId, postIds } = await seedThread()
    const before = await forumRow(FORUM)

    await repo.applyEdit(edit(postIds[1]!, threadId))

    expect(await forumRow(FORUM)).toMatchObject({ post_count: before.post_count })
    expect(await threadRow(threadId)).toMatchObject({ reply_count: 1 })
  })

  it('takes the post off the board when the edit sends it back for approval', async () => {
    const { threadId, postIds } = await seedThread()
    const before = await forumRow(FORUM)
    const beforeAuthor = await userPostCount()

    await repo.applyEdit(edit(postIds[1]!, threadId, { toVisibility: 'unapproved' }))

    expect(await forumRow(FORUM)).toMatchObject({ post_count: before.post_count - 1 })
    expect(await threadRow(threadId)).toMatchObject({ reply_count: 0 })
    expect(await userPostCount()).toBe(beforeAuthor - 1)
    expect((await postRow(postIds[1]!)).visibility).toBe('unapproved')
  })

  it('keeps the thread’s title in the opening post’s index across an edit', async () => {
    const { threadId, postIds } = await seedThread()
    const first = postIds[0]!

    await repo.applyEdit(
      edit(first, threadId, { isFirstPost: true, previousMessage: 'the opening post' }),
    )

    const found = await new PostgresSearchRepository(db).search(
      {
        terms: 'hello',
        match: 'everything',
        grouping: 'posts',
        sort: 'relevance',
        limit: 10,
        after: null,
      },
      {
        forumIds: [FORUM],
        ownThreadsOnlyForumIds: [],
        viewerUserId: null,
        content: PUBLIC_CONTENT,
      },
    )
    expect(found.hits.map((hit) => hit.postId)).toEqual([first])
  })

  it('brings a post from an older document version up to date', async () => {
    const { threadId, postIds } = await seedThread()
    await db.execute(sql`update posts set search_version = 0`)

    const search = new PostgresSearchRepository(db)
    expect(await search.indexProgress()).toEqual({ indexed: 0, pending: 2 })

    await repo.applyEdit(edit(postIds[1]!, threadId))

    expect(await search.indexProgress()).toEqual({ indexed: 1, pending: 1 })
  })

  it('leaves the reader-facing notice alone on a silent edit', async () => {
    const { threadId, postIds } = await seedThread()
    await repo.applyEdit(edit(postIds[1]!, threadId, { silent: true }))

    expect(await postRow(postIds[1]!)).toMatchObject({
      message: 'a **revised** body',
      revision_count: 1,
      edited_at: null,
      edited_by_user_id: null,
      edit_reason: null,
    })
  })

  it('records the revision on a silent edit, so nothing is lost from the trail', async () => {
    const { threadId, postIds } = await seedThread()
    await repo.applyEdit(edit(postIds[1]!, threadId, { silent: true }))

    const revisions = resultRows(
      await db.execute(sql`
        select revision, message, edit_reason, edited_by_user_id, created_at
          from post_revisions where post_id = ${postIds[1]!}
      `),
    ) as Array<{ revision: number; message: string; edit_reason: string | null }>

    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({
      revision: 1,
      message: 'reply 0',
      edit_reason: 'typo',
      edited_by_user_id: AUTHOR,
    })
  })

  it('does not wipe a notice somebody else left behind', async () => {
    const { threadId, postIds } = await seedThread()

    await repo.applyEdit(edit(postIds[1]!, threadId, { editedByUserId: MOD }))
    await repo.applyEdit(
      edit(postIds[1]!, threadId, {
        silent: true,
        revision: 2,
        previousMessage: 'a **revised** body',
        message: 'third time',
      }),
    )

    expect(await postRow(postIds[1]!)).toMatchObject({
      message: 'third time',
      revision_count: 2,
      edited_by_user_id: MOD,
    })
    expect((await postRow(postIds[1]!)).edited_at).not.toBeNull()
  })

  it('numbers a second revision after the first', async () => {
    const { threadId, postIds } = await seedThread()
    await repo.applyEdit(edit(postIds[1]!, threadId))
    await repo.applyEdit(
      edit(postIds[1]!, threadId, {
        revision: 2,
        previousMessage: 'a **revised** body',
        message: 'third time',
      }),
    )

    const revisions = resultRows(
      await db.execute(sql`
        select revision, message from post_revisions where post_id = ${postIds[1]!} order by revision
      `),
    ) as Array<{ revision: number; message: string }>

    expect(revisions.map((r) => Number(r.revision))).toEqual([1, 2])
    expect(revisions[1]!.message).toBe('a **revised** body')
    expect((await postRow(postIds[1]!)).revision_count).toBe(2)
  })
})

describe('applyVisibility', () => {
  const move = (
    postId: number,
    threadId: number,
    from: 'visible' | 'unapproved' | 'deleted',
    to: 'visible' | 'deleted',
    isFirstPost = false,
  ) => ({
    postId,
    threadId,
    forumId: FORUM,
    authorUserId: AUTHOR,
    isFirstPost,
    from,
    to,
    actedByUserId: AUTHOR,
    at: new Date('2026-07-30T13:00:00Z'),
  })

  it('reverses exactly what creating the post applied', async () => {
    const { threadId, postIds } = await seedThread()
    const before = { forum: await forumRow(FORUM), author: await userPostCount() }

    expect(await repo.applyVisibility(move(postIds[1]!, threadId, 'visible', 'deleted'))).toBe(true)

    expect(await forumRow(FORUM)).toMatchObject({
      post_count: before.forum.post_count - 1,
      thread_count: before.forum.thread_count,
    })
    expect(await threadRow(threadId)).toMatchObject({ reply_count: 0 })
    expect(await userPostCount()).toBe(before.author - 1)
  })

  it('moves nothing when a post goes from the queue to deleted', async () => {
    const { threadId, postIds } = await seedThread()
    await repo.applyVisibility(move(postIds[1]!, threadId, 'visible', 'deleted'))
    await db.execute(sql`update posts set visibility = 'unapproved' where id = ${postIds[1]!}`)
    const before = { forum: await forumRow(FORUM), thread: await threadRow(threadId) }

    expect(await repo.applyVisibility(move(postIds[1]!, threadId, 'unapproved', 'deleted'))).toBe(
      true,
    )

    expect(await forumRow(FORUM)).toMatchObject({ post_count: before.forum.post_count })
    expect(await threadRow(threadId)).toMatchObject({ reply_count: before.thread.reply_count })
  })

  it('puts the counters back on restore', async () => {
    const { threadId, postIds } = await seedThread()
    const before = { forum: await forumRow(FORUM), author: await userPostCount() }

    await repo.applyVisibility(move(postIds[1]!, threadId, 'visible', 'deleted'))
    await repo.applyVisibility(move(postIds[1]!, threadId, 'deleted', 'visible'))

    expect(await forumRow(FORUM)).toMatchObject({ post_count: before.forum.post_count })
    expect(await threadRow(threadId)).toMatchObject({ reply_count: 1 })
    expect(await userPostCount()).toBe(before.author)
  })

  it('is a no-op on a second submit', async () => {
    const { threadId, postIds } = await seedThread()
    await repo.applyVisibility(move(postIds[1]!, threadId, 'visible', 'deleted'))
    const after = await forumRow(FORUM)

    expect(await repo.applyVisibility(move(postIds[1]!, threadId, 'visible', 'deleted'))).toBe(
      false,
    )
    expect(await forumRow(FORUM)).toMatchObject({ post_count: after.post_count })
  })

  describe('last-post pointers', () => {
    it('moves the thread and forum pointers back to the newest survivor', async () => {
      const { threadId, postIds } = await seedThread(FORUM, 2)
      const newest = postIds[2]!
      expect(await threadRow(threadId)).toMatchObject({ last_post_id: newest })
      expect(await forumRow(FORUM)).toMatchObject({ last_post_id: newest })

      await repo.applyVisibility(move(newest, threadId, 'visible', 'deleted'))

      expect(await threadRow(threadId)).toMatchObject({ last_post_id: postIds[1] })
      expect(await forumRow(FORUM)).toMatchObject({ last_post_id: postIds[1] })
    })

    it('repairs every ancestor, not just the posting forum', async () => {
      const { threadId, postIds } = await seedThread(FORUM, 1)
      const newest = postIds[1]!
      expect(await forumRow(CATEGORY)).toMatchObject({ last_post_id: newest })

      await repo.applyVisibility(move(newest, threadId, 'visible', 'deleted'))

      expect(await forumRow(CATEGORY)).toMatchObject({ last_post_id: postIds[0] })
    })

    it('finds the replacement in a sibling subtree', async () => {
      const older = await seedThread(CHILD, 0, new Date('2026-07-30T10:00:00Z'))
      const newer = await seedThread(FORUM, 0, new Date('2026-07-30T12:00:00Z'))
      expect(await forumRow(CATEGORY)).toMatchObject({ last_post_id: newer.postIds[0] })

      await repo.applyVisibility(
        move(newer.postIds[0]!, newer.threadId, 'visible', 'deleted', true),
      )

      expect(await forumRow(CATEGORY)).toMatchObject({ last_post_id: older.postIds[0] })
      expect(await forumRow(FORUM)).toMatchObject({ last_post_id: older.postIds[0] })
    })

    it('nulls the pointer when nothing visible is left', async () => {
      const { threadId, postIds } = await seedThread(FORUM, 0)
      await repo.applyVisibility(move(postIds[0]!, threadId, 'visible', 'deleted', true))

      expect(await threadRow(threadId)).toMatchObject({ last_post_id: null })
      expect(await forumRow(FORUM)).toMatchObject({ last_post_id: null })
      expect(await forumRow(CATEGORY)).toMatchObject({ last_post_id: null })
    })
  })

  it('records the change as an event for the ancestors to follow', async () => {
    const { threadId, postIds } = await seedThread()
    await db.execute(sql`delete from outbox`)

    await repo.applyVisibility(move(postIds[1]!, threadId, 'visible', 'deleted'))

    const events = resultRows(await db.execute(sql`select topic, payload from outbox`)) as Array<{
      topic: string
      payload: { postId: number; visible: boolean }
    }>

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      topic: 'post.visibility_changed',
      payload: { postId: postIds[1], visible: false },
    })
  })
})

describe('the moderator log a single-post write leaves', () => {
  async function logRows(): Promise<
    Array<{ user_id: number; action: string; detail: Record<string, unknown> }>
  > {
    return resultRows(
      await db.execute(sql`select user_id, action, detail from admin_log order by id`),
    ) as Array<{ user_id: number; action: string; detail: Record<string, unknown> }>
  }

  const visibility = (
    postId: number,
    threadId: number,
    from: 'visible' | 'deleted',
    to: 'visible' | 'deleted',
    actedByUserId: number,
  ) => ({
    postId,
    threadId,
    forumId: FORUM,
    authorUserId: AUTHOR,
    isFirstPost: false,
    from,
    to,
    actedByUserId,
    at: new Date('2026-07-30T13:00:00Z'),
  })

  const edit = (postId: number, threadId: number, editedByUserId: number) => ({
    postId,
    threadId,
    forumId: FORUM,
    authorUserId: AUTHOR,
    isFirstPost: false,
    message: 'a **revised** body',
    reason: 'off topic',
    editedByUserId,
    editedAt: new Date('2026-07-30T13:00:00Z'),
    silent: false,
    previousMessage: 'reply 0',
    previousSubject: null,
    revision: 1,
    fromVisibility: 'visible' as const,
    toVisibility: 'visible' as const,
  })

  it('records a moderator removing somebody else"s post, with the forum it was in', async () => {
    const { threadId, postIds } = await seedThread()

    await repo.applyVisibility(visibility(postIds[1]!, threadId, 'visible', 'deleted', MOD))

    const rows = await logRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: MOD, action: 'post.delete' })
    expect(rows[0]!.detail).toEqual({
      postId: postIds[1],
      threadId,
      forumId: FORUM,
      forumIds: [FORUM],
    })
  })

  it('records the restore as its own action rather than the deletion again', async () => {
    const { threadId, postIds } = await seedThread()

    await repo.applyVisibility(visibility(postIds[1]!, threadId, 'visible', 'deleted', MOD))
    await repo.applyVisibility(visibility(postIds[1]!, threadId, 'deleted', 'visible', MOD))

    expect((await logRows()).map((row) => row.action)).toEqual(['post.delete', 'post.restore'])
  })

  it('says nothing when a member removes their own post', async () => {
    const { threadId, postIds } = await seedThread()

    await repo.applyVisibility(visibility(postIds[1]!, threadId, 'visible', 'deleted', AUTHOR))

    expect(await logRows()).toEqual([])
  })

  it('writes no row for a delete that changed nothing', async () => {
    const { threadId, postIds } = await seedThread()

    await repo.applyVisibility(visibility(postIds[1]!, threadId, 'visible', 'deleted', MOD))
    await repo.applyVisibility(visibility(postIds[1]!, threadId, 'visible', 'deleted', MOD))

    expect(await logRows()).toHaveLength(1)
  })

  it('records a moderator editing a post they did not write', async () => {
    const { threadId, postIds } = await seedThread()

    await repo.applyEdit(edit(postIds[1]!, threadId, MOD))

    const rows = await logRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: MOD, action: 'post.edit' })
    expect(rows[0]!.detail).toEqual({
      postId: postIds[1],
      threadId,
      forumId: FORUM,
      forumIds: [FORUM],
    })
  })

  it('keeps the edit reason and the new body out of the log', async () => {
    const { threadId, postIds } = await seedThread()

    await repo.applyEdit(edit(postIds[1]!, threadId, MOD))

    const written = JSON.stringify(await logRows())
    expect(written).not.toContain('off topic')
    expect(written).not.toContain('revised')
  })

  it('says nothing when the author edits their own post', async () => {
    const { threadId, postIds } = await seedThread()

    await repo.applyEdit(edit(postIds[1]!, threadId, AUTHOR))

    expect(await logRows()).toEqual([])
  })

  it('records a moderator acting on a post whose author has no account', async () => {
    const { threadId, postIds } = await seedThread()
    await db.execute(sql`
      update posts set author_user_id = null where id = ${postIds[1]!}
    `)

    await repo.applyVisibility({
      ...visibility(postIds[1]!, threadId, 'visible', 'deleted', MOD),
      authorUserId: null,
    })

    expect((await logRows())[0]).toMatchObject({ action: 'post.delete' })
  })
})

describe('applyAncestorVisibilityChange', () => {
  it('takes a deleted post off its ancestors', async () => {
    const { threadId, postIds } = await seedThread()
    const before = await forumRow(CATEGORY)

    await repo.applyVisibility({
      postId: postIds[1]!,
      threadId,
      forumId: FORUM,
      authorUserId: AUTHOR,
      isFirstPost: false,
      from: 'visible',
      to: 'deleted',
      actedByUserId: AUTHOR,
      at: AT,
    })
    expect(await applyAncestorVisibilityChange(db, postIds[1]!)).toBe(true)

    expect(await forumRow(CATEGORY)).toMatchObject({ post_count: before.post_count - 1 })
  })

  it('is a no-op on redelivery', async () => {
    const { threadId, postIds } = await seedThread()
    await repo.applyVisibility({
      postId: postIds[1]!,
      threadId,
      forumId: FORUM,
      authorUserId: AUTHOR,
      isFirstPost: false,
      from: 'visible',
      to: 'deleted',
      actedByUserId: AUTHOR,
      at: AT,
    })

    expect(await applyAncestorVisibilityChange(db, postIds[1]!)).toBe(true)
    const after = await forumRow(CATEGORY)
    expect(await applyAncestorVisibilityChange(db, postIds[1]!)).toBe(false)
    expect(await forumRow(CATEGORY)).toMatchObject({ post_count: after.post_count })
  })

  it('converges when a delete and a restore arrive in the wrong order', async () => {
    const { threadId, postIds } = await seedThread()
    const before = await forumRow(CATEGORY)
    const args = {
      postId: postIds[1]!,
      threadId,
      forumId: FORUM,
      authorUserId: AUTHOR,
      isFirstPost: false,
      actedByUserId: AUTHOR,
      at: AT,
    }

    await repo.applyVisibility({ ...args, from: 'visible', to: 'deleted' })
    await repo.applyVisibility({ ...args, from: 'deleted', to: 'visible' })

    await applyAncestorVisibilityChange(db, postIds[1]!)
    await applyAncestorVisibilityChange(db, postIds[1]!)

    expect(await forumRow(CATEGORY)).toMatchObject({ post_count: before.post_count })
  })

  it('restores an ancestor count that a delete removed', async () => {
    const { threadId, postIds } = await seedThread()
    const before = await forumRow(CATEGORY)
    const args = {
      postId: postIds[1]!,
      threadId,
      forumId: FORUM,
      authorUserId: AUTHOR,
      isFirstPost: false,
      actedByUserId: AUTHOR,
      at: AT,
    }

    await repo.applyVisibility({ ...args, from: 'visible', to: 'deleted' })
    await applyAncestorVisibilityChange(db, postIds[1]!)
    expect(await forumRow(CATEGORY)).toMatchObject({ post_count: before.post_count - 1 })

    await repo.applyVisibility({ ...args, from: 'deleted', to: 'visible' })
    await applyAncestorVisibilityChange(db, postIds[1]!)
    expect(await forumRow(CATEGORY)).toMatchObject({ post_count: before.post_count })
  })
})
