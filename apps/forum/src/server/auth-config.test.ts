/**
 * F13 — the activation method is a setting, and this is where it becomes one.
 *
 * Before `boardAuthConfig` existed, `registration.method` was a registered
 * setting with no reader: the ACP dropdown moved, the row was stored, and every
 * account was still created under the hardcoded `'none'`. These pin the read,
 * both directions of the fixture carve-out, and the fallback for a value the
 * registry did not write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'

const stored = vi.hoisted(() => ({ method: 'email' as string }))

vi.mock('./settings', () => ({
  getSettings: async () => ({ get: () => stored.method }),
}))

const { AUTH_CONFIG, boardAuthConfig } = await import('./auth-config')

/** Run as a board with a real database behind it. */
async function onPostgres<T>(body: () => Promise<T>): Promise<T> {
  vi.stubEnv('DATA_SOURCE', 'postgres')
  vi.stubEnv('DATABASE_URL', 'postgres://user:pw@localhost:5432/board')
  resetEnvForTests()
  try {
    return await body()
  } finally {
    vi.unstubAllEnvs()
    resetEnvForTests()
  }
}

beforeEach(() => {
  stored.method = 'email'
})

describe('boardAuthConfig', () => {
  it('takes the activation method from the settings registry', async () => {
    expect((await onPostgres(boardAuthConfig)).activationMethod).toBe('email')

    stored.method = 'both'
    expect((await onPostgres(boardAuthConfig)).activationMethod).toBe('both')
  })

  it('leaves the rest of the policy exactly as the const declares it', async () => {
    const resolved = await onPostgres(boardAuthConfig)

    expect(resolved.minPasswordLength).toBe(AUTH_CONFIG.minPasswordLength)
    expect(resolved.defaultMemberGroupId).toBe(AUTH_CONFIG.defaultMemberGroupId)
    expect(resolved.reservedUsernames).toEqual(AUTH_CONFIG.reservedUsernames)
  })

  it('keeps the sample board at "none", where no operator can change it', async () => {
    // The registry default is 'email'. Applying it in fixture mode would mean
    // a demo board that mints activation links nobody can act on, chosen by
    // nobody and un-choosable from anywhere.
    expect((await boardAuthConfig()).activationMethod).toBe('none')
  })

  it('falls back to the const for a value the registry did not write', async () => {
    stored.method = 'whatever-somebody-put-in-the-table'
    expect((await onPostgres(boardAuthConfig)).activationMethod).toBe(
      AUTH_CONFIG.activationMethod,
    )
  })
})
