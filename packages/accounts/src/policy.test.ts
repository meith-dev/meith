/**
 * F13 — laying a board's stored answers over the built-in policy.
 *
 * Four settings were registered with no reader for a long time, so the rules a
 * board actually enforced were the constants in `policy.ts` whatever the ACP
 * showed. This is the mapping that fixed that, and it is shared by three
 * composition roots — the app, the installer and `forum user:create` — which is
 * why it is tested here rather than at any one of them.
 */
import { describe, expect, it } from 'vitest'

import { AUTH_SETTING_KEYS, DEFAULT_AUTH_POLICY, resolveAuthPolicy } from './policy'

const BASE = { ...DEFAULT_AUTH_POLICY, activationMethod: 'none' as const }

/** A reader over a plain object, as a settings snapshot would be. */
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
      }),
      BASE,
    )

    expect(resolved).toEqual({
      activationMethod: 'both',
      minPasswordLength: 16,
      usernameMin: 4,
      usernameMax: 24,
    })
  })

  it('falls back to the base for anything unset', () => {
    expect(resolveAuthPolicy(reader({}), BASE)).toEqual({
      activationMethod: BASE.activationMethod,
      minPasswordLength: BASE.minPasswordLength,
      usernameMin: BASE.usernameMin,
      usernameMax: BASE.usernameMax,
    })
  })

  /**
   * The mutant this kills: trusting the stored value's type.
   *
   * `NaN` is the one that matters. It survives a `typeof value === 'number'`
   * check, and every comparison against it is false — so a `usernameMin` of
   * `NaN` does not shorten the minimum, it removes the check, and a board with
   * one hand-edited row silently accepts an empty username.
   */
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

  /**
   * The registry validates each field alone, so this pair is savable — and no
   * username can satisfy it, which is a registration form that refuses
   * everybody while showing two numbers that each look reasonable.
   */
  it('reverts both username bounds when the minimum exceeds the maximum', () => {
    const resolved = resolveAuthPolicy(
      reader({
        [AUTH_SETTING_KEYS.usernameMin]: 30,
        [AUTH_SETTING_KEYS.usernameMax]: 10,
      }),
      BASE,
    )

    // Both, not one: honouring half of an impossible pair is a rule nobody
    // chose — a minimum of 30 against the built-in maximum of 30 would leave
    // exactly one acceptable length.
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
