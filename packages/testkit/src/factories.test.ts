import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { schema } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'

import { createFactories } from './factories'

let harness: TestDb

beforeAll(async () => {
  harness = await createTestDb()
})

afterAll(async () => {
  await harness.close()
})

describe('createFactories', () => {
  it('creates unique, related rows and maintains their denormalised pointers', async () => {
    const factory = createFactories(harness.db)
    const category = await factory.forum({ type: 'category' })
    const forum = await factory.forum({ parent: category })
    const author = await factory.user()
    const thread = await factory.thread({ forum, author })
    const opening = await factory.post({ thread, author })
    await factory.post({ thread, author, isFirstPost: false })

    const [storedThread] = await harness.db
      .select()
      .from(schema.threads)
      .where(eq(schema.threads.id, thread.id))

    expect(category.path).toBe(String(category.id))
    expect(forum.path).toBe(`${category.id}.${forum.id}`)
    expect(opening.threadId).toBe(thread.id)
    expect(storedThread).toMatchObject({ firstPostId: opening.id, replyCount: 1 })
  })
})
