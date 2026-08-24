import { describe, expect, it } from 'vitest'

import { MEITH_VERSION, PLUGIN_API_MAJOR, THEME_API_MAJOR } from './build-info'
import { parseSemver } from './range'

describe('build-info', () => {
  it('MEITH_VERSION is a real semver', () => {
    expect(parseSemver(MEITH_VERSION)).not.toBeNull()
  })

  it('both api majors are non-negative integers', () => {
    expect(Number.isInteger(THEME_API_MAJOR)).toBe(true)
    expect(THEME_API_MAJOR).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(PLUGIN_API_MAJOR)).toBe(true)
    expect(PLUGIN_API_MAJOR).toBeGreaterThanOrEqual(0)
  })
})
