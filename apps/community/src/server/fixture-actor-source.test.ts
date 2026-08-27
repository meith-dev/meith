import { beforeEach, describe, expect, it } from 'vitest'

import {
  type AccountStore,
  createMemoryStore,
  IdentityService,
  MemoryBanFilters,
} from '@meith/accounts'

import { AUTH_CONFIG } from './auth-config'
import { FixtureActorSource } from './fixture-actor-source'
import { SEED_BOARD, SEED_GROUP } from './seed-board'

let store: AccountStore
let source: FixtureActorSource

beforeEach(() => {
  store = createMemoryStore()
  source = new FixtureActorSource(store)
})

describe('FixtureActorSource', () => {
  it('builds the guest principal in the guest group', async () => {
    const guest = await source.buildGuest()
    expect(guest.userId).toBeNull()
    expect(guest.state).toBe('guest')
    expect(guest.groupIds).toEqual([SEED_GROUP.guest])

    const guestGroup = SEED_BOARD.groups.find((g) => g.groupId === SEED_GROUP.guest)!
    expect(guest.global).toEqual(guestGroup.permissions)
  })

  it('builds a registered user in their primary group with combined permissions', async () => {
    const identity = new IdentityService({
      store,
      config: AUTH_CONFIG,
      banFilters: new MemoryBanFilters(),
    })
    const { account } = await identity.register({
      username: 'alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    })

    const actor = await source.buildForUser(account.id)
    expect(actor).not.toBeNull()
    expect(actor!.userId).toBe(account.id)
    expect(actor!.primaryGroupId).toBe(SEED_GROUP.registered)
    expect(actor!.state).toBe('active')

    const registeredGroup = SEED_BOARD.groups.find((g) => g.groupId === SEED_GROUP.registered)!
    expect(actor!.global).toEqual(registeredGroup.permissions)
  })

  it('returns null for a user that does not exist', async () => {
    expect(await source.buildForUser(9999)).toBeNull()
  })
})
