import { describe, expect, it } from 'vitest'

import {
  DARK_TOKENS as DEFAULT_DARK,
  LIGHT_TOKENS as DEFAULT_LIGHT,
  defaultTheme,
  SCHEME_INDEPENDENT_TOKENS,
  type TokenName,
} from '@meith/theme-default'
import {
  assertThemeContract,
  colourToHex,
  oklchToRgb,
  parseColour,
  resolveTheme,
  rgbToOklch,
  SLOT_NAMES,
} from '@meith/theme-kit'

import { vershellTheme } from './theme'
import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS } from './tokens'

describe('the vershell theme', () => {
  it('satisfies the theme-kit contract', () => {
    expect(assertThemeContract(resolveTheme(vershellTheme)).missing).toEqual([])
  })

  it('inherits from the default theme rather than copying it', () => {
    expect(resolveTheme(vershellTheme).chain).toEqual(['vershell', 'default'])
  })

  it('fills the surfaces that carry the look and inherits the rest', () => {
    const own = Object.keys(vershellTheme.slots)
    expect(own).toHaveLength(22)
    expect(own).toContain('PostBit')
    expect(own).not.toContain('PanelShell')

    const resolved = resolveTheme(vershellTheme)
    expect(resolved.slots.PanelShell).toBe(defaultTheme.slots.PanelShell)
    expect(resolved.slots.PostBit).not.toBe(defaultTheme.slots.PostBit)
  })

  it.each([
    ['ForumRow', 'CategoryBlock'],
    ['ThreadRow', 'ForumDisplay'],
  ])('overrides %s together with its container %s', (row, container) => {
    const own = Object.keys(vershellTheme.slots)
    expect(own).toContain(row)
    expect(own).toContain(container)
  })

  it('fills nothing the registry does not name', () => {
    for (const name of Object.keys(vershellTheme.slots)) {
      expect(SLOT_NAMES).toContain(name)
    }
  })
})

describe('the vershell palette', () => {
  it('declares exactly the tokens the default theme does', () => {
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(Object.keys(DEFAULT_LIGHT).sort())
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(DEFAULT_DARK).sort())
  })

  it('is achromatic apart from the one blue', () => {
    for (const tokens of [LIGHT_TOKENS, DARK_TOKENS]) {
      for (const name of [
        'background',
        'foreground',
        'surface',
        'card',
        'muted',
        'muted-foreground',
        'accent',
        'border',
        'input',
      ]) {
        const parsed = parseColour(tokens[name] ?? '')
        expect(parsed, name).not.toBeNull()
        expect(parsed!.c, name).toBeLessThan(0.03)
      }
      expect(tokens.primary).toBe(tokens.ring)
      expect(parseColour(tokens.primary ?? '')!.c).toBeGreaterThan(0.1)
      expect(Math.round(parseColour(tokens.primary ?? '')!.h)).toBeGreaterThan(220)
      expect(Math.round(parseColour(tokens.primary ?? '')!.h)).toBeLessThan(280)
    }
  })

  it('draws with shadow-as-border cards, not rules', () => {
    for (const tokens of [LIGHT_TOKENS, DARK_TOKENS]) {
      expect(tokens.radius).toBe('0.375rem')
      expect(tokens.elevation).not.toBe('none')
      expect(tokens.card).not.toBe(tokens.background)
    }
    for (const name of SCHEME_INDEPENDENT_TOKENS) {
      expect(LIGHT_TOKENS[name], name).toBe(DARK_TOKENS[name])
    }
  })

  it('keeps the semantic marks the default theme ships', () => {
    for (const name of [
      'thread-pinned',
      'thread-locked',
      'moderation-approved',
      'group-admin',
    ] as const satisfies readonly TokenName[]) {
      expect(LIGHT_TOKENS[name], name).toBe(DEFAULT_LIGHT[name])
      expect(DARK_TOKENS[name], name).toBe(DEFAULT_DARK[name])
    }
  })

  it('survives OKLCH → sRGB → OKLCH, so mail and meta tags can render it as hex', () => {
    for (const value of [...Object.values(LIGHT_TOKENS), ...Object.values(DARK_TOKENS)]) {
      const parsed = parseColour(value)
      if (parsed === null) continue

      const { rgb, inGamut } = oklchToRgb(parsed)
      expect(inGamut, value).toBe(true)

      const back = rgbToOklch(rgb)
      expect(back.l, `${value} lightness`).toBeCloseTo(parsed.l, 2)
      expect(back.c, `${value} chroma`).toBeCloseTo(parsed.c, 2)
    }
  })

  it('names the browser chrome after the two backgrounds', () => {
    expect(colourToHex(LIGHT_TOKENS.background ?? '')).toBe(BROWSER_THEME_COLOR.light)
    expect(colourToHex(DARK_TOKENS.background ?? '')).toBe(BROWSER_THEME_COLOR.dark)
  })
})
