import { describe, expect, it } from 'vitest'

import {
  DEPRECATIONS,
  SLOT_STABILITY,
  THEME_API_VERSION,
  assertDeprecationPolicy,
  assertThemeContract,
  checkThemeContract,
  compareApiVersions,
  deprecationsFor,
  parseApiVersion,
  requiredSlots,
  type Deprecation,
  type Stability,
} from './api'
import { SLOT_NAMES, type SlotName } from './slots'

/**
 * Fixtures, not the shipped list.
 *
 * `DEPRECATIONS` is empty today and will be for some time. A policy engine whose
 * only input is `[]` has never run, so every rule below is exercised against a
 * deliberately wrong schedule — which is also the only way the rule's mutant can
 * be killed (D10).
 */
function deprecation(overrides: Partial<Deprecation> = {}): Deprecation {
  return {
    kind: 'slot',
    name: 'WhoIsOnline',
    since: '1.2',
    removeIn: '2.0',
    replacement: 'BoardStats',
    reason: 'Folded into the statistics block.',
    ...overrides,
  }
}

/** A stability map with one slot overridden, so the exhaustive record stays honest. */
function stabilityWith(overrides: Partial<Record<SlotName, Stability>>): Record<string, Stability> {
  return { ...SLOT_STABILITY, ...overrides }
}

function themeFilling(names: readonly SlotName[]) {
  const slots: Record<string, unknown> = {}
  for (const name of names) slots[name] = () => null
  return { key: 'fixture', slots }
}

describe('the slot contract', () => {
  it('classifies every slot, and nothing that is not a slot', () => {
    expect(Object.keys(SLOT_STABILITY).sort()).toEqual([...SLOT_NAMES].sort())
  })

  /*
   * The freeze itself. If a slot is stable, a theme in the wild may be rendering
   * it, and F78's midnight theme and F79's plugins are written against exactly
   * this list. Changing an entry from stable to anything else is a breaking
   * change and has to be an edit to a test that says so.
   */
  it('freezes everything except the two F45 islands', () => {
    const provisional = SLOT_NAMES.filter((name) => SLOT_STABILITY[name] === 'provisional')
    expect([...provisional].sort()).toEqual(['EditorToolbar', 'QuickReply'])
  })

  /*
   * No *slot* is deprecated, which is the load-bearing half: a slot going away
   * is work for every theme, and a field a theme was told never to render is
   * not. The schedule itself is checked by `assertDeprecationPolicy` below —
   * this asserts what is on it, so adding an entry is a deliberate edit to a
   * test rather than a line nobody reviewed.
   */
  it('deprecates one field and no slot', () => {
    expect(DEPRECATIONS.map((entry) => entry.name)).toEqual(['PostBitModel.quoteSource'])
    expect(DEPRECATIONS.every((entry) => entry.kind === 'field')).toBe(true)
    expect(SLOT_NAMES.filter((name) => SLOT_STABILITY[name] === 'deprecated')).toEqual([])
  })

  it('requires every non-provisional slot of a theme', () => {
    expect(requiredSlots()).not.toContain('QuickReply')
    expect(requiredSlots()).toContain('PostBit')
    expect(requiredSlots().length).toBe(SLOT_NAMES.length - 2)
  })

  /* A deprecated slot is still rendered by a page, so a theme still needs it. */
  it('still requires a deprecated slot', () => {
    const stability = stabilityWith({ WhoIsOnline: 'deprecated' })
    expect(requiredSlots(stability)).toContain('WhoIsOnline')
  })
})

describe('version parsing', () => {
  it('reads major.minor', () => {
    expect(parseApiVersion('1.0')).toEqual({ major: 1, minor: 0 })
    expect(parseApiVersion('12.34')).toEqual({ major: 12, minor: 34 })
  })

  /*
   * The lenient parser is the dangerous one: it yields NaN, every comparison
   * against NaN is false, and the fallen-due check silently stops firing.
   */
  it.each(['1', 'v1.0', '1.0.0', '1.x', '', ' 1.0'])('refuses %o', (value) => {
    expect(() => parseApiVersion(value)).toThrow(/not an API version/)
  })

  it('orders by major first and then minor', () => {
    expect(compareApiVersions('1.0', '2.0')).toBeLessThan(0)
    expect(compareApiVersions('2.0', '1.9')).toBeGreaterThan(0)
    expect(compareApiVersions('1.2', '1.10')).toBeLessThan(0)
    expect(compareApiVersions('1.2', '1.2')).toBe(0)
  })
})

describe('the deprecation policy', () => {
  it('accepts a coherent schedule', () => {
    expect(() =>
      assertDeprecationPolicy(
        [deprecation()],
        stabilityWith({ WhoIsOnline: 'deprecated' }),
        '1.3',
      ),
    ).not.toThrow()
  })

  it('accepts the shipped, empty schedule', () => {
    expect(() =>
      assertDeprecationPolicy(DEPRECATIONS, SLOT_STABILITY, THEME_API_VERSION),
    ).not.toThrow()
  })

  it('refuses a deprecation naming a slot that does not exist', () => {
    expect(() =>
      assertDeprecationPolicy([deprecation({ name: 'Postbit' })], SLOT_STABILITY, '1.3'),
    ).toThrow(/does not exist/)
  })

  it('refuses a field deprecation that is not Model.field', () => {
    expect(() =>
      assertDeprecationPolicy(
        [deprecation({ kind: 'field', name: 'legacyId' })],
        SLOT_STABILITY,
        '1.3',
      ),
    ).toThrow(/Model\.field/)
  })

  /* Removing in a minor is the promise "minors are additive" broken. */
  it('refuses a removal scheduled for a minor release', () => {
    expect(() =>
      assertDeprecationPolicy(
        [deprecation({ removeIn: '1.4' })],
        stabilityWith({ WhoIsOnline: 'deprecated' }),
        '1.3',
      ),
    ).toThrow(/minor release/)
  })

  it('refuses a removal in the same major it was deprecated in', () => {
    expect(() =>
      assertDeprecationPolicy(
        [deprecation({ since: '2.1', removeIn: '2.0' })],
        stabilityWith({ WhoIsOnline: 'deprecated' }),
        '1.3',
      ),
    ).toThrow(/at least one major/)
  })

  /*
   * The check that makes the schedule mean something. Reaching 2.0 with the slot
   * still in the registry fails the build of 2.0 — which is the release that
   * promised to remove it.
   */
  it('refuses a removal that has fallen due', () => {
    expect(() =>
      assertDeprecationPolicy(
        [deprecation()],
        stabilityWith({ WhoIsOnline: 'deprecated' }),
        '2.0',
      ),
    ).toThrow(/scheduled for removal in 2\.0 and this build is 2\.0/)
  })

  it('refuses a deprecation with no reason', () => {
    expect(() =>
      assertDeprecationPolicy(
        [deprecation({ reason: '  ' })],
        stabilityWith({ WhoIsOnline: 'deprecated' }),
        '1.3',
      ),
    ).toThrow(/no reason/)
  })

  it('refuses a slot marked deprecated with no schedule', () => {
    expect(() =>
      assertDeprecationPolicy([], stabilityWith({ WhoIsOnline: 'deprecated' }), '1.3'),
    ).toThrow(/no entry in DEPRECATIONS/)
  })

  it('refuses a scheduled slot that is still marked stable', () => {
    expect(() => assertDeprecationPolicy([deprecation()], SLOT_STABILITY, '1.3')).toThrow(
      /still marked "stable"/,
    )
  })

  it('finds the deprecations for a slot and for its model’s fields', () => {
    const entries = [
      deprecation(),
      deprecation({ kind: 'field', name: 'WhoIsOnlineModel.mostEver' }),
      deprecation({ kind: 'field', name: 'PostBitModel.legacyId' }),
    ]
    expect(deprecationsFor('WhoIsOnline', entries)).toHaveLength(2)
    expect(deprecationsFor('PostBit', entries)).toHaveLength(1)
    expect(deprecationsFor('Shell', entries)).toEqual([])
  })
})

describe('measuring a theme against the contract', () => {
  it('passes a theme that fills every required slot', () => {
    const report = checkThemeContract(themeFilling(requiredSlots()))
    expect(report.satisfies).toBe(true)
    expect(report.missing).toEqual([])
    expect(report.version).toBe(THEME_API_VERSION)
  })

  it('names what is missing, in registry order', () => {
    const filled = requiredSlots().filter(
      (name) => name !== 'PostBit' && name !== 'MemberProfile',
    )
    const report = checkThemeContract(themeFilling(filled))
    expect(report.satisfies).toBe(false)
    expect(report.missing).toEqual(['PostBit', 'MemberProfile'])
  })

  /* Not filling a provisional slot is the normal case, not a shortfall. */
  it('does not ask for the provisional slots', () => {
    const report = checkThemeContract(themeFilling(requiredSlots()))
    expect(report.satisfies).toBe(true)
    expect(report.provisionalInUse).toEqual([])
  })

  it('reports a provisional slot that is filled, without failing it', () => {
    const report = checkThemeContract(themeFilling([...requiredSlots(), 'QuickReply']))
    expect(report.satisfies).toBe(true)
    expect(report.provisionalInUse).toEqual(['QuickReply'])
  })

  it('reports a deprecated slot in use with its schedule', () => {
    const report = checkThemeContract(
      themeFilling(requiredSlots()),
      stabilityWith({ WhoIsOnline: 'deprecated' }),
      [deprecation()],
    )
    expect(report.deprecatedInUse.map((entry) => entry.name)).toEqual(['WhoIsOnline'])
    expect(report.deprecatedInUse[0]?.removeIn).toBe('2.0')
  })

  it('does not report a deprecated slot the theme never filled', () => {
    const filled = requiredSlots().filter((name) => name !== 'WhoIsOnline')
    const report = checkThemeContract(themeFilling(filled), stabilityWith({}), [deprecation()])
    expect(report.deprecatedInUse).toEqual([])
  })

  it('throws with the whole list, not the first missing slot', () => {
    const filled = requiredSlots().filter(
      (name) => name !== 'Shell' && name !== 'Footer' && name !== 'ErrorNotice',
    )
    expect(() => assertThemeContract(themeFilling(filled))).toThrow(
      /3 required slot\(s\) unfilled — Shell, Footer, ErrorNotice/,
    )
  })

  it('returns the report when the theme passes', () => {
    expect(assertThemeContract(themeFilling(requiredSlots())).satisfies).toBe(true)
  })
})
