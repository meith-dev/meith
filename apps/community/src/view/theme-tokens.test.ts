import { describe, expect, it } from 'vitest'

import { LIGHT_TOKENS, TOKEN_NAMES } from '@meith/theme-default'

import {
  BRAND_PRESETS,
  BRAND_TOKENS,
  groupTokens,
  isSchemeIndependent,
  tokenMeta,
} from './theme-tokens'

describe('groupTokens', () => {
  const tokens = TOKEN_NAMES.map((name) => ({ name }))

  it('places every token the default theme declares', () => {
    const placed = groupTokens(tokens).flatMap((group) => group.tokens.map((t) => t.name))

    expect([...placed].sort()).toEqual([...TOKEN_NAMES].sort())
  })

  it('describes every one of them, so nothing lands in "Other" today', () => {
    expect(groupTokens(tokens).map((group) => group.title)).not.toContain('Other')
  })

  it('offers only tokens the theme actually has', () => {
    const groups = groupTokens([{ name: 'primary' }])
    expect(groups.flatMap((group) => group.tokens.map((t) => t.name))).toEqual(['primary'])
  })

  it('keeps an undescribed token rather than dropping it', () => {
    const groups = groupTokens([{ name: 'primary' }, { name: 'invented-by-a-theme' }])
    const other = groups.find((group) => group.title === 'Other')

    expect(other?.tokens.map((t) => t.name)).toEqual(['invented-by-a-theme'])
  })
})

describe('token kinds', () => {
  it('marks geometry, the font stacks and the shadow shape as scheme-independent', () => {
    for (const name of [
      'radius',
      'density-unit',
      'font-mono-stack',
      'font-sans-stack',
      'elevation',
    ]) {
      expect(isSchemeIndependent(name), name).toBe(true)
    }
  })

  it('marks every colour token as scheme-dependent', () => {
    for (const name of [
      'primary',
      'primary-hover',
      'surface',
      'shadow-tint',
      'background',
      'thread-locked',
      'group-admin',
    ]) {
      expect(isSchemeIndependent(name), name).toBe(false)
    }
  })

  it('falls back to the token name for anything undescribed', () => {
    expect(tokenMeta('invented').label).toBe('invented')
  })
})

describe('BRAND_PRESETS', () => {
  it('names only tokens the default theme declares', () => {
    for (const preset of BRAND_PRESETS) {
      for (const name of [...Object.keys(preset.light), ...Object.keys(preset.dark)]) {
        expect(LIGHT_TOKENS, `${preset.key}/${name}`).toHaveProperty(name)
      }
    }
  })

  it('sets a different value in each scheme', () => {
    for (const preset of BRAND_PRESETS) {
      expect(Object.keys(preset.dark), preset.key).toEqual(Object.keys(preset.light))
      for (const name of BRAND_TOKENS) {
        expect(preset.dark[name], `${preset.key}/${name}`).not.toBe(preset.light[name])
      }
    }
  })

  it('sets every brand token', () => {
    for (const preset of BRAND_PRESETS) {
      for (const scheme of ['light', 'dark'] as const) {
        expect(Object.keys(preset[scheme]).sort(), `${preset.key}/${scheme}`).toEqual(
          [...BRAND_TOKENS].sort(),
        )
      }
    }
  })

  it('has no duplicate keys', () => {
    const keys = BRAND_PRESETS.map((preset) => preset.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
