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

import { meithTheme } from './theme'
import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS } from './tokens'

describe('the meith theme', () => {
  it('satisfies the theme-kit contract', () => {
    expect(assertThemeContract(resolveTheme(meithTheme)).missing).toEqual([])
  })

  it('inherits from the default theme rather than copying it', () => {
    expect(resolveTheme(meithTheme).chain).toEqual(['meith', 'default'])
  })

  it('fills every slot the registry names, so no screen falls back to the default look', () => {
    const own = Object.keys(meithTheme.slots)
    expect(own.sort()).toEqual([...SLOT_NAMES].sort())

    const resolved = resolveTheme(meithTheme)
    for (const name of SLOT_NAMES) {
      expect(resolved.slots[name], name).not.toBe(defaultTheme.slots[name])
    }
  })

  it.each([
    ['ForumRow', 'CategoryBlock'],
    ['ThreadRow', 'ForumDisplay'],
  ])('overrides %s together with its container %s', (row, container) => {
    const own = Object.keys(meithTheme.slots)
    expect(own).toContain(row)
    expect(own).toContain(container)
  })

  it('fills nothing the registry does not name', () => {
    for (const name of Object.keys(meithTheme.slots)) {
      expect(SLOT_NAMES).toContain(name)
    }
  })
})

describe('the meith palette', () => {
  it('declares exactly the tokens the default theme does', () => {
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(Object.keys(DEFAULT_LIGHT).sort())
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(DEFAULT_DARK).sort())
  })

  it('is greyscale apart from the one green', () => {
    for (const tokens of [LIGHT_TOKENS, DARK_TOKENS]) {
      for (const name of [
        'background',
        'foreground',
        'surface',
        'card',
        'muted',
        'muted-foreground',
        'border',
        'input',
      ]) {
        const parsed = parseColour(tokens[name] ?? '')
        expect(parsed, name).not.toBeNull()
        expect(parsed!.c, name).toBeLessThan(0.03)
      }
      expect(tokens.primary).toBe(tokens.ring)
      expect(parseColour(tokens.primary ?? '')!.c).toBeGreaterThan(0.1)
    }
  })

  it('draws with rules rather than boxes', () => {
    for (const tokens of [LIGHT_TOKENS, DARK_TOKENS]) {
      expect(tokens.radius).toBe('0rem')
      expect(tokens.elevation).toBe('none')
      expect(tokens.card).toBe(tokens.background)
    }
    for (const name of SCHEME_INDEPENDENT_TOKENS) {
      expect(LIGHT_TOKENS[name], name).toBe(DARK_TOKENS[name])
    }
  })

  it('keeps the semantic marks on the greyscale ramp, so a label carries the meaning', () => {
    for (const tokens of [LIGHT_TOKENS, DARK_TOKENS]) {
      for (const name of [
        'accent',
        'forum-locked',
        'thread-pinned',
        'thread-locked',
        'thread-unapproved',
        'thread-deleted',
        'post-highlight',
        'post-unapproved',
        'moderation-pending',
        'moderation-approved',
        'moderation-rejected',
        'group-admin',
        'group-supermod',
        'group-mod',
      ] as const satisfies readonly TokenName[]) {
        expect(parseColour(tokens[name] ?? '')!.c, name).toBeLessThan(0.03)
      }
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
