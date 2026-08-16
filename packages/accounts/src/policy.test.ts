import { describe, expect, it } from 'vitest'

import { AUTH_SETTING_KEYS, DEFAULT_AUTH_POLICY, resolveAuthPolicy } from './policy'

const BASE = { ...DEFAULT_AUTH_POLICY, activationMethod: 'none' as const }

function reader(values: Record<string, unknown>) {
  return (key: string): unknown => values[key]
}

describe('resolveAuthPolicy', () => {
  it('takes every configured value the board stored', () => {
    const resolved = resolveAuthPolicy(
      reader({
        [AUTH_SETTING_KEYS.activationMethod]: 'both',
        [AUTH_SETTING_KEYS.minPasswordLength]: 16,
        [AUTH_SETTING_KEYS.usernameMin]: 4,
        [AUTH_SETTING_KEYS.usernameMax]: 24,
        [AUTH_SETTING_KEYS.maxLoginAttempts]: 3,
        [AUTH_SETTING_KEYS.maxAccountLoginAttempts]: 30,
        [AUTH_SETTING_KEYS.lockoutMinutes]: 60,
        [AUTH_SETTING_KEYS.sessionLifetimeDays]: 7,
      }),
      BASE,
    )

    expect(resolved).toEqual({
      activationMethod: 'both',
      minPasswordLength: 16,
      usernameMin: 4,
      usernameMax: 24,
      maxLoginAttempts: 3,
      maxAccountLoginAttempts: 30,
      lockoutMinutes: 60,
      sessionLifetimeDays: 7,
    })
  })

  it('falls back to the base for anything unset', () => {
    expect(resolveAuthPolicy(reader({}), BASE)).toEqual({
      activationMethod: BASE.activationMethod,
      minPasswordLength: BASE.minPasswordLength,
      usernameMin: BASE.usernameMin,
      usernameMax: BASE.usernameMax,
      maxLoginAttempts: BASE.maxLoginAttempts,
      maxAccountLoginAttempts: BASE.maxAccountLoginAttempts,
      lockoutMinutes: BASE.lockoutMinutes,
      sessionLifetimeDays: BASE.sessionLifetimeDays,
    })
  })

  it('reads a zero lockout count as the operator switching it off', () => {
    const resolved = resolveAuthPolicy(
      reader({
        [AUTH_SETTING_KEYS.maxLoginAttempts]: 0,
        [AUTH_SETTING_KEYS.maxAccountLoginAttempts]: 0,
      }),
      BASE,
    )

    expect(resolved.maxLoginAttempts).toBe(0)
    expect(resolved.maxAccountLoginAttempts).toBe(0)
  })

  it('refuses a zero for the two that have no "off"', () => {
    const resolved = resolveAuthPolicy(
      reader({
        [AUTH_SETTING_KEYS.lockoutMinutes]: 0,
        [AUTH_SETTING_KEYS.sessionLifetimeDays]: 0,
      }),
      BASE,
    )

    expect(resolved.lockoutMinutes).toBe(BASE.lockoutMinutes)
    expect(resolved.sessionLifetimeDays).toBe(BASE.sessionLifetimeDays)
  })

  it.each([
    ['NaN', Number.NaN],
    ['a string', '5'],
    ['a fraction', 2.5],
    ['negative', -1],
    ['null', null],
  ])('ignores a stored %s for the lockout counts', (_label, value) => {
    const resolved = resolveAuthPolicy(
      reader({
        [AUTH_SETTING_KEYS.maxLoginAttempts]: value,
        [AUTH_SETTING_KEYS.maxAccountLoginAttempts]: value,
      }),
      BASE,
    )

    expect(resolved.maxLoginAttempts).toBe(BASE.maxLoginAttempts)
    expect(resolved.maxAccountLoginAttempts).toBe(BASE.maxAccountLoginAttempts)
  })

  it.each([
    ['NaN', Number.NaN],
    ['a string', '16'],
    ['a fraction', 10.5],
    ['zero', 0],
    ['negative', -1],
    ['null', null],
  ])('ignores a stored %s', (_label, value) => {
    const resolved = resolveAuthPolicy(
      reader({
        [AUTH_SETTING_KEYS.minPasswordLength]: value,
        [AUTH_SETTING_KEYS.usernameMin]: value,
        [AUTH_SETTING_KEYS.usernameMax]: value,
      }),
      BASE,
    )

    expect(resolved.minPasswordLength).toBe(BASE.minPasswordLength)
    expect(resolved.usernameMin).toBe(BASE.usernameMin)
    expect(resolved.usernameMax).toBe(BASE.usernameMax)
  })

  it('ignores an activation method the registry would not have written', () => {
    const resolved = resolveAuthPolicy(
      reader({ [AUTH_SETTING_KEYS.activationMethod]: 'sometimes' }),
      BASE,
    )
    expect(resolved.activationMethod).toBe(BASE.activationMethod)
  })

  it('reverts both username bounds when the minimum exceeds the maximum', () => {
    const resolved = resolveAuthPolicy(
      reader({
        [AUTH_SETTING_KEYS.usernameMin]: 30,
        [AUTH_SETTING_KEYS.usernameMax]: 10,
      }),
      BASE,
    )

    expect(resolved.usernameMin).toBe(BASE.usernameMin)
    expect(resolved.usernameMax).toBe(BASE.usernameMax)
  })

  it('allows a minimum equal to the maximum, which is satisfiable', () => {
    const resolved = resolveAuthPolicy(
      reader({
        [AUTH_SETTING_KEYS.usernameMin]: 8,
        [AUTH_SETTING_KEYS.usernameMax]: 8,
      }),
      BASE,
    )

    expect(resolved.usernameMin).toBe(8)
    expect(resolved.usernameMax).toBe(8)
  })
})
