import { Authorizer } from '@meith/authorization'
import { ActorBuilder, PostgresAuthorizationSource } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { measureQueries } from './query-budget'
import { SMOKE_SCALE, seedBoard } from './seed'

let harness: TestDb
let authorizer: Authorizer
let actor: Awaited<ReturnType<ActorBuilder['buildForUser']>>

beforeAll(async () => {
  harness = await createTestDb()
  const board = await seedBoard(harness.db, SMOKE_SCALE)

  authorizer = new Authorizer(new PostgresAuthorizationSource(harness.db))
  actor = await new ActorBuilder(harness.db, { guestGroupId: 1 }).buildForUser(
    board.userIds[0] as number,
  )
}, 60_000)

afterAll(async () => {
  await harness.close()
})

describe('visibleForumIds', () => {
  it('costs a constant number of queries, not one per forum', async () => {
    const { value, count } = await measureQueries(harness, () =>
      authorizer.visibleForumIds(actor!),
    )

    expect(value.length).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(3)
  })

  it('costs the same on a board five times the size', async () => {
    const bigger = await createTestDb()
    try {
      await seedBoard(bigger.db, { ...SMOKE_SCALE, forums: 60, categories: 5, threads: 5 })

      const bigAuthorizer = new Authorizer(new PostgresAuthorizationSource(bigger.db))
      const bigActor = await new ActorBuilder(bigger.db, { guestGroupId: 1 }).buildGuest()

      const small = await measureQueries(harness, () => authorizer.visibleForumIds(actor!))
      const large = await measureQueries(bigger, () =>
        bigAuthorizer.visibleForumIds(bigActor),
      )

      expect(large.count).toBe(small.count)
    } finally {
      await bigger.close()
    }
  }, 60_000)
})
