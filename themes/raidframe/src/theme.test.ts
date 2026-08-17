import { describe, expect, it } from 'vitest'

import {
  DARK_TOKENS as DEFAULT_DARK,
  LIGHT_TOKENS as DEFAULT_LIGHT,
  defaultTheme,
  SCHEME_INDEPENDENT_TOKENS,
} from '@meith/theme-default'
import { assertThemeContract, resolveTheme, SLOT_NAMES, SLOT_STABILITY } from '@meith/theme-kit'

import { raidframeTheme } from './theme'
import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS } from './tokens'

describe('the raidframe theme', () => {
  it('satisfies the theme-kit contract', () => {
    expect(assertThemeContract(resolveTheme(raidframeTheme)).missing).toEqual([])
  })

  it('inherits from the default theme rather than copying it', () => {
    expect(resolveTheme(raidframeTheme).chain).toEqual(['raidframe', 'default'])
  })

  it('fills every stable slot itself, leaving only the provisional ones inherited', () => {
    const own = new Set(Object.keys(raidframeTheme.slots))
    const stable = SLOT_NAMES.filter((name) => SLOT_STABILITY[name] === 'stable')

    expect(stable.filter((name) => !own.has(name))).toEqual([])
    expect(SLOT_NAMES.filter((name) => SLOT_STABILITY[name] === 'provisional')).not.toEqual([])
    for (const name of SLOT_NAMES) {
      if (SLOT_STABILITY[name] === 'provisional') expect(own.has(name)).toBe(false)
    }

    const resolved = resolveTheme(raidframeTheme)
    expect(resolved.slots.PostBit).not.toBe(defaultTheme.slots.PostBit)
  })

  it('carries the control panels, search results and discovery it was given later', () => {
    const own = Object.keys(raidframeTheme.slots)
    for (const name of [
      'PanelShell',
      'PanelNav',
      'PanelPage',
      'PanelSection',
      'AuthPage',
      'SearchResults',
      'DiscoveryView',
    ]) {
      expect(own).toContain(name)
    }
  })

  it.each([
    ['ForumRow', 'CategoryBlock'],
    ['ThreadRow', 'ForumDisplay'],
  ])('overrides %s together with its container %s', (row, container) => {
    const own = Object.keys(raidframeTheme.slots)
    expect(own).toContain(row)
    expect(own).toContain(container)
  })

  it('fills nothing the registry does not name', () => {
    for (const name of Object.keys(raidframeTheme.slots)) {
      expect(SLOT_NAMES).toContain(name)
    }
  })
})

describe('the raidframe palette', () => {
  it('declares exactly the tokens the default theme does', () => {
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(Object.keys(DEFAULT_LIGHT).sort())
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(DEFAULT_DARK).sort())
  })

  it('shares no colour value with the default theme', () => {
    const shared = (a: Record<string, string>, b: Record<string, string>): string[] =>
      Object.keys(a).filter(
        (name) =>
          a[name] === b[name] && !(SCHEME_INDEPENDENT_TOKENS as readonly string[]).includes(name),
      )

    expect(shared(LIGHT_TOKENS, DEFAULT_LIGHT)).toEqual([])
    expect(shared(DARK_TOKENS, DEFAULT_DARK)).toEqual([])
  })

  it('differs from the default theme in geometry too', () => {
    expect(LIGHT_TOKENS.radius).not.toBe(DEFAULT_LIGHT.radius)
    expect(LIGHT_TOKENS['density-unit']).not.toBe(DEFAULT_LIGHT['density-unit'])
  })

  it('carries a browser theme colour for both schemes', () => {
    expect(BROWSER_THEME_COLOR.light).toMatch(/^#[0-9a-f]{6}$/)
    expect(BROWSER_THEME_COLOR.dark).toMatch(/^#[0-9a-f]{6}$/)
  })
})
