import { resetEnvForTests } from '@meith/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEMO_LOGINS } from './accounts'
import { assertDemoAccountIsChangeable, isProtectedDemoAccount } from './protected'

function inDemoMode<T>(body: () => T): T {
  vi.stubEnv('DEMO_MODE', '1')
  vi.stubEnv('DATA_SOURCE', 'postgres')
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/demo')
  resetEnvForTests()
  return body()
}

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
})

describe('the published logins', () => {
  it('are protected on a demo', () => {
    inDemoMode(() => {
      expect(isProtectedDemoAccount(DEMO_LOGINS.admin.username)).toBe(true)
      expect(isProtectedDemoAccount(DEMO_LOGINS.moderator.username)).toBe(true)
      expect(isProtectedDemoAccount(DEMO_LOGINS.member.username)).toBe(true)
    })
  })

  it('are matched however the caller cased or padded the name', () => {
    inDemoMode(() => {
      expect(isProtectedDemoAccount('  ADMIN ')).toBe(true)
    })
  })

  it('protect nobody on a board that is not a demo', () => {
    expect(isProtectedDemoAccount(DEMO_LOGINS.admin.username)).toBe(false)
    expect(() => assertDemoAccountIsChangeable('admin', 'password')).not.toThrow()
  })

  it('leave an account a visitor made themselves alone', () => {
    inDemoMode(() => {
      expect(isProtectedDemoAccount('someone_who_registered')).toBe(false)
      expect(() =>
        assertDemoAccountIsChangeable('someone_who_registered', 'password'),
      ).not.toThrow()
    })
  })

  it('refuse a password, email or username change, and say why', () => {
    inDemoMode(() => {
      for (const field of ['password', 'email', 'username'] as const) {
        expect(() => assertDemoAccountIsChangeable('admin', field)).toThrow(
          new RegExp(`${field} is fixed`),
        )
      }
    })
  })
})
