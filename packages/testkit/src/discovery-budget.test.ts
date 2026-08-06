import { Authorizer } from '@meith/authorization'
import { PUBLIC_CONTENT } from '@meith/core'
import { ActorBuilder, PostgresAuthorizationSource, PostgresDiscoveryRepository } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { measureQueries } from './query-budget'
import { SMOKE_SCALE, seedBoard } from './seed'

let harness: TestDb
let repo: PostgresDiscoveryRepository
let forumIds: number[]
let viewerUserId: number

beforeAll(async () => {
  harness = await createTestDb()
  const board = await seedBoard(harness.db, SMOKE_SCALE)

  const authorizer = new Authorizer(new PostgresAuthorizationSource(harness.db))
  const actor = await new ActorBuilder(harness.db, { guestGroupId: 1 }).buildForUser(
    board.userIds[0] as number,
  )

  repo = new PostgresDiscoveryRepository(harness.db)
  forumIds = await authorizer.forumIdsWhere(actor!, 'thread.view')
  viewerUserId = actor!.userId as number
}, 60_000)

afterAll(async () => {
  await harness.close()
})

const scope = () => ({ forumIds, content: PUBLIC_CONTENT, viewerUserId })
const query = { limit: 20, after: null }
const EPOCH = new Date('2000-01-01T00:00:00Z')

describe('discovery query budget', () => {
  it('answers "what is new" in one query', async () => {
    const { value, count } = await measureQueries(harness, () =>
      repo.activeSince(EPOCH, query, scope()),
    )

    expect(value.rows.length).toBeGreaterThan(0)
    expect(count).toBe(1)
  })

  it('answers "unanswered" in one query', async () => {
    const { count } = await measureQueries(harness, () => repo.unanswered(query, scope()))
    expect(count).toBe(1)
  })

  it('answers "threads I posted in" in one query', async () => {
    const { count } = await measureQueries(harness, () =>
      repo.participatedIn(viewerUserId, query, scope()),
    )
    expect(count).toBe(1)
  })

  it('costs the same on a board several times the size', async () => {
    const bigger = await createTestDb()
    try {
      const board = await seedBoard(bigger.db, {
        ...SMOKE_SCALE,
        forums: 40,
        categories: 4,
        threads: 10,
      })

      const bigAuthorizer = new Authorizer(new PostgresAuthorizationSource(bigger.db))
      const bigActor = await new ActorBuilder(bigger.db, { guestGroupId: 1 }).buildForUser(
        board.userIds[0] as number,
      )
      const bigRepo = new PostgresDiscoveryRepository(bigger.db)
      const bigScope = {
        forumIds: await bigAuthorizer.forumIdsWhere(bigActor!, 'thread.view'),
        content: PUBLIC_CONTENT,
        viewerUserId: bigActor!.userId as number,
      }

      const small = await measureQueries(harness, () => repo.activeSince(EPOCH, query, scope()))
      const large = await measureQueries(bigger, () =>
        bigRepo.activeSince(EPOCH, query, bigScope),
      )

      expect(large.count).toBe(small.count)
    } finally {
      await bigger.close()
    }
  }, 60_000)
})
