import { ForbiddenError, ValidationError } from '@meith/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { rejectionMessage } from './test-support.fixture'

import { BanService } from './ban-service'
import { MemoryBans } from './memory-bans'

const MODERATOR_GROUP = 5
const REGISTERED_GROUP = 2
const BANNED_GROUP = 7
const USER = 100

let bans: MemoryBans
let now: Date
let service: BanService

beforeEach(() => {
  bans = new MemoryBans()
  now = new Date('2026-07-30T12:00:00Z')
  service = new BanService({
    bans,
    bannedGroupId: BANNED_GROUP,
    clock: () => now,
  })
  bans.setPrimaryGroup(USER, MODERATOR_GROUP)
})

describe('banning', () => {
  it('moves the user into the banned group', async () => {
    await service.ban({ userId: USER })
    expect(bans.primaryGroupOf(USER)).toBe(BANNED_GROUP)
  })

  it('revokes their sessions, so a ban is not merely a logout', async () => {
    await service.ban({ userId: USER })
    expect(bans.revoked).toContain(USER)
  })

  it('refuses to ban someone already banned', async () => {
    await service.ban({ userId: USER })
    await expect(service.ban({ userId: USER })).rejects.toThrow(ValidationError)
  })

  it('refuses an expiry in the past', async () => {
    await expect(
      service.ban({ userId: USER, expiresAt: new Date('2020-01-01T00:00:00Z') }),
    ).rejects.toThrow(ValidationError)
  })
})

describe('expiry restores the prior group', () => {
  it('restores the group the user actually held, not the default', async () => {
    await service.ban({ userId: USER, expiresAt: new Date('2026-08-06T12:00:00Z') })
    expect(bans.primaryGroupOf(USER)).toBe(BANNED_GROUP)

    now = new Date('2026-08-06T12:00:01Z')
    expect(await service.expireDue()).toBe(1)

    expect(bans.primaryGroupOf(USER)).toBe(MODERATOR_GROUP)
    expect(bans.primaryGroupOf(USER)).not.toBe(REGISTERED_GROUP)
  })

  it('leaves a ban that has not expired alone', async () => {
    await service.ban({ userId: USER, expiresAt: new Date('2026-08-06T12:00:00Z') })

    now = new Date('2026-08-01T00:00:00Z')
    expect(await service.expireDue()).toBe(0)
    expect(bans.primaryGroupOf(USER)).toBe(BANNED_GROUP)
  })

  it('never expires a permanent ban', async () => {
    await service.ban({ userId: USER })

    now = new Date('2099-01-01T00:00:00Z')
    expect(await service.expireDue()).toBe(0)
    expect(bans.primaryGroupOf(USER)).toBe(BANNED_GROUP)
  })

  it('is idempotent — running twice changes nothing the second time', async () => {
    await service.ban({ userId: USER, expiresAt: new Date('2026-08-06T12:00:00Z') })
    now = new Date('2026-08-06T12:00:01Z')

    expect(await service.expireDue()).toBe(1)
    expect(await service.expireDue()).toBe(0)
    expect(bans.primaryGroupOf(USER)).toBe(MODERATOR_GROUP)
  })

  it('catches up after missing several days of ticks', async () => {
    await service.ban({ userId: USER, expiresAt: new Date('2026-08-06T12:00:00Z') })

    now = new Date('2026-08-09T12:00:00Z')
    expect(await service.expireDue()).toBe(1)
    expect(bans.primaryGroupOf(USER)).toBe(MODERATOR_GROUP)
  })

  it('is bounded, so one tick cannot run unbounded', async () => {
    for (let userId = 200; userId < 210; userId++) {
      bans.setPrimaryGroup(userId, REGISTERED_GROUP)
      await service.ban({ userId, expiresAt: new Date('2026-08-06T12:00:00Z') })
    }

    now = new Date('2026-08-07T00:00:00Z')
    expect(await service.expireDue(4)).toBe(4)
    expect(await service.expireDue(100)).toBe(6)
  })
})

describe('lifting early', () => {
  it('restores the prior group, same as expiry', async () => {
    await service.ban({ userId: USER })
    await service.lift(USER)
    expect(bans.primaryGroupOf(USER)).toBe(MODERATOR_GROUP)
  })

  it('refuses to lift a ban that is not there', async () => {
    await expect(service.lift(USER)).rejects.toThrow(ValidationError)
  })

  it('allows a fresh ban after lifting', async () => {
    await service.ban({ userId: USER })
    await service.lift(USER)
    await expect(service.ban({ userId: USER })).resolves.toBeDefined()
  })
})

describe('assertNotBanned', () => {
  it('passes for an unbanned user', async () => {
    await expect(service.assertNotBanned(USER)).resolves.toBeUndefined()
  })

  it('throws for a banned user', async () => {
    await service.ban({ userId: USER })
    await expect(service.assertNotBanned(USER)).rejects.toThrow(ForbiddenError)
  })

  it('surfaces the public reason and never the internal one', async () => {
    await service.ban({
      userId: USER,
      reason: 'linked to the sockpuppet ring we are tracking',
      publicReason: 'repeated spam',
    })

    const message = await rejectionMessage(service.assertNotBanned(USER))
    expect(message).toContain('repeated spam')
    expect(message).not.toContain('sockpuppet')
  })

  it('says nothing specific when there is no public reason', async () => {
    await service.ban({ userId: USER, reason: 'internal only' })
    const message = await rejectionMessage(service.assertNotBanned(USER))
    expect(message).not.toContain('internal only')
  })

  it('passes again once the ban expires', async () => {
    await service.ban({ userId: USER, expiresAt: new Date('2026-08-06T12:00:00Z') })
    now = new Date('2026-08-07T00:00:00Z')
    await service.expireDue()

    await expect(service.assertNotBanned(USER)).resolves.toBeUndefined()
  })
})
