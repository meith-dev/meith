import {
  DARK_TOKENS as DEFAULT_DARK,
  LIGHT_TOKENS as DEFAULT_LIGHT,
  defaultTheme,
} from '@meith/theme-default'
import { assertThemeContract, resolveTheme, SLOT_NAMES } from '@meith/theme-kit'
import { describe, expect, it } from 'vitest'

import { midnightTheme } from './theme'
import { DARK_TOKENS, LIGHT_TOKENS } from './tokens'

describe('the midnight theme', () => {
  it('satisfies the theme-kit contract', () => {
    expect(assertThemeContract(resolveTheme(midnightTheme)).missing).toEqual([])
  })

  it('inherits from the default theme rather than copying it', () => {
    expect(resolveTheme(midnightTheme).chain).toEqual(['midnight', 'default'])
  })

  it('fills the surfaces that carry the look and inherits the rest', () => {
    const own = Object.keys(midnightTheme.slots)
    expect(own).toHaveLength(20)
    expect(own).toContain('PostBit')
    expect(own).not.toContain('ErrorNotice')

    const resolved = resolveTheme(midnightTheme)
    expect(resolved.slots.ErrorNotice).toBe(defaultTheme.slots.ErrorNotice)
    expect(resolved.slots.PostBit).not.toBe(defaultTheme.slots.PostBit)
  })

  it.each([
    ['ForumRow', 'CategoryBlock'],
    ['ThreadRow', 'ForumDisplay'],
  ])('overrides %s together with its container %s', (row, container) => {
    const own = Object.keys(midnightTheme.slots)
    expect(own).toContain(row)
    expect(own).toContain(container)
  })

  it('fills nothing the registry does not name', () => {
    for (const name of Object.keys(midnightTheme.slots)) {
      expect(SLOT_NAMES).toContain(name)
    }
  })
})

describe('the midnight palette', () => {
  it('declares exactly the tokens the default theme does', () => {
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(Object.keys(DEFAULT_LIGHT).sort())
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(DEFAULT_DARK).sort())
  })

  it('shares no colour value with the default theme', () => {
    const shared = (a: Record<string, string>, b: Record<string, string>): string[] =>
      Object.keys(a).filter(
        (name) =>
          a[name] === b[name] &&
          !['radius', 'density-unit', 'font-mono-stack'].includes(name),
      )

    expect(shared(LIGHT_TOKENS, DEFAULT_LIGHT)).toEqual([])
    expect(shared(DARK_TOKENS, DEFAULT_DARK)).toEqual([])
  })

  it('differs from the default theme in geometry too', () => {
    expect(LIGHT_TOKENS.radius).not.toBe(DEFAULT_LIGHT.radius)
    expect(LIGHT_TOKENS['density-unit']).not.toBe(DEFAULT_LIGHT['density-unit'])
  })
})
