import { afterAll, beforeAll } from 'vitest'

import { MemoryBanFilters } from '@meith/accounts'

import { banFilterRepositoryContract, CONTRACT_AUTHOR } from './ban-filter-contract.fixture'
import { PostgresBanFilterRepository } from './ban-repos'
import { createTestDb, type TestDb } from './pglite.fixture'
import { banFilters, users } from './schema'

let harness: TestDb

beforeAll(async () => {
  harness = await createTestDb()

  await harness.db.insert(users).values({
    id: CONTRACT_AUTHOR,
    username: 'Admin',
    usernameLower: 'admin',
    email: 'admin@example.test',
    emailLower: 'admin@example.test',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: 4,
  })
}, 60_000)

afterAll(async () => {
  await harness.close()
})

banFilterRepositoryContract('MemoryBanFilters', async () => new MemoryBanFilters())

banFilterRepositoryContract('PostgresBanFilterRepository', async () => {
  await harness.db.delete(banFilters)
  return new PostgresBanFilterRepository(harness.db)
})
