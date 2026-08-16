import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'
import { SettingsSnapshot } from '@meith/settings'

const stored = vi.hoisted(() => ({ values: {} as Record<string, unknown> }))

vi.mock('./settings', () => ({
  getSettings: async () => ({ get: (key: string) => stored.values[key] }),
}))

const { AUTH_CONFIG, REMEMBER_DAYS, boardAuthConfig, boardSessionConfig } =
  await import('./auth-config')

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

  it('takes the lockout and the session timeout from the registry as well', async () => {
    stored.values = {
      'registration.method': 'none',
      'security.max_login_attempts': 3,
      'security.max_account_login_attempts': 30,
      'security.lockout_minutes': 60,
      'security.session_idle_days': 7,
    }

    const resolved = await onPostgres(boardAuthConfig)

    expect(resolved.maxLoginAttempts).toBe(3)
    expect(resolved.maxAccountLoginAttempts).toBe(30)
    expect(resolved.lockoutMinutes).toBe(60)
    expect(resolved.sessionLifetimeDays).toBe(7)
  })

  it('lets an operator switch the lockout off outright', async () => {
    stored.values = { 'registration.method': 'none', 'security.max_login_attempts': 0 }

    expect((await onPostgres(boardAuthConfig)).maxLoginAttempts).toBe(0)
  })

  it('hands the session timeout to whoever mints a session', async () => {
    stored.values = { 'registration.method': 'none', 'security.session_idle_days': 7 }

    const resolved = await onPostgres(boardSessionConfig)

    expect(resolved.sessionLifetimeDays).toBe(7)
    expect(resolved.rememberDays).toBe(REMEMBER_DAYS)
  })

  it('leaves what the board does not configure exactly as the const declares it', async () => {
    const resolved = await onPostgres(boardAuthConfig)

    expect(resolved.maxLoginAttempts).toBe(AUTH_CONFIG.maxLoginAttempts)
    expect(resolved.sessionLifetimeDays).toBe(AUTH_CONFIG.sessionLifetimeDays)
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
