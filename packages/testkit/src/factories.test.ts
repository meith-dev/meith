import { schema } from '@meith/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
    const category = await factory.community({ type: 'category' })
    const community = await factory.community({ parent: category })
    const author = await factory.user()
    const thread = await factory.thread({ community, author })
    const opening = await factory.post({ thread, author })
    await factory.post({ thread, author, isFirstPost: false })

    const [storedThread] = await harness.db
      .select()
      .from(schema.threads)
      .where(eq(schema.threads.id, thread.id))

    expect(category.path).toBe(String(category.id))
    expect(community.path).toBe(`${category.id}.${community.id}`)
    expect(opening.threadId).toBe(thread.id)
    expect(storedThread).toMatchObject({ firstPostId: opening.id, replyCount: 1 })
  })
})
