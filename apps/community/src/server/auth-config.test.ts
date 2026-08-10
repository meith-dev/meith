import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'
import { SettingsSnapshot } from '@meith/settings'

const stored = vi.hoisted(() => ({ values: {} as Record<string, unknown> }))

vi.mock('./settings', () => ({
  getSettings: async () => ({ get: (key: string) => stored.values[key] }),
}))

const { AUTH_CONFIG, boardAuthConfig } = await import('./auth-config')

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
  stored.values = { 'registration.method': 'email' }
})

describe('boardAuthConfig', () => {
  it('takes the activation method from the settings registry', async () => {
    expect((await onPostgres(boardAuthConfig)).activationMethod).toBe('email')

    stored.values['registration.method'] = 'both'
    expect((await onPostgres(boardAuthConfig)).activationMethod).toBe('both')
  })

  it('takes the password and username rules from the registry too', async () => {
    stored.values = {
      'registration.method': 'none',
      'registration.min_password_length': 16,
      'registration.username_min': 4,
      'registration.username_max': 24,
    }

    const resolved = await onPostgres(boardAuthConfig)

    expect(resolved.minPasswordLength).toBe(16)
    expect(resolved.usernameMin).toBe(4)
    expect(resolved.usernameMax).toBe(24)
  })

  it('leaves what the board does not configure exactly as the const declares it', async () => {
    const resolved = await onPostgres(boardAuthConfig)

    expect(resolved.maxLoginAttempts).toBe(AUTH_CONFIG.maxLoginAttempts)
    expect(resolved.sessionIdleDays).toBe(AUTH_CONFIG.sessionIdleDays)
    expect(resolved.resetTokenTtlMinutes).toBe(AUTH_CONFIG.resetTokenTtlMinutes)
    expect(resolved.defaultMemberGroupId).toBe(AUTH_CONFIG.defaultMemberGroupId)
    expect(resolved.reservedUsernames).toEqual(AUTH_CONFIG.reservedUsernames)
  })

  it('keeps the sample board at "none", where no operator can change it', async () => {
    expect((await boardAuthConfig()).activationMethod).toBe('none')
  })

  it('a board that has stored nothing gets a method that needs no mail', () => {
    const untouched = SettingsSnapshot.fromOverrides(new Map())
    expect(['none', 'admin']).toContain(untouched.get('registration.method'))
  })

  it('falls back to the const for a value the registry did not write', async () => {
    stored.values['registration.method'] = 'whatever-somebody-put-in-the-table'
    expect((await onPostgres(boardAuthConfig)).activationMethod).toBe(
      AUTH_CONFIG.activationMethod,
    )
  })
})
