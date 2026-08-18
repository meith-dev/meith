import { describe, expect, it } from 'vitest'

import { FALLBACK_PALETTE, mailPalette, mergeTokenOverrides, type ThemeTokenSet } from './palette'

const TOKENS: ThemeTokenSet = {
  light: {
    background: 'oklch(0.968 0 0)',
    card: 'oklch(1 0 0)',
    'card-foreground': 'oklch(0.205 0 0)',
    surface: 'oklch(0.941 0 0)',
    border: 'oklch(0.905 0 0)',
    'muted-foreground': 'oklch(0.494 0 0)',
    primary: 'oklch(0.508 0.105 165.6)',
    'primary-foreground': 'oklch(0.985 0 0)',
    radius: '0.5rem',
    'font-sans-stack': 'var(--font-inter), ui-sans-serif, system-ui, sans-serif',
    'font-heading-stack': 'var(--font-sans-stack)',
  },
  dark: {
    background: 'oklch(0.15 0 0)',
    card: 'oklch(0.196 0 0)',
    'card-foreground': 'oklch(0.967 0 0)',
    surface: 'oklch(0.17 0 0)',
    border: 'oklch(0.31 0 0)',
    'muted-foreground': 'oklch(0.702 0 0)',
    primary: 'oklch(0.773 0.153 163.2)',
    'primary-foreground': 'oklch(0.181 0.029 166.6)',
    radius: '0.5rem',
  },
}

describe('mailPalette', () => {
  it('converts every token to sRGB hex, because mail clients cannot parse OKLCH', () => {
    const palette = mailPalette(TOKENS)

    for (const scheme of [palette.light, palette.dark]) {
      for (const value of Object.values(scheme)) {
        expect(value, value).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('carries the theme colour, converted from the OKLCH the board stores', () => {
    expect(mailPalette(TOKENS).light.primary).toBe('#047857')
    expect(
      mailPalette({ ...TOKENS, light: { ...TOKENS.light, primary: '#ff0000' } }).light.primary,
    ).toBe('#ff0000')
  })

  it('never emits a double quote, which would break out of a style attribute', () => {
    const palette = mailPalette({
      ...TOKENS,
      light: { ...TOKENS.light, 'font-sans-stack': '"Segoe UI", sans-serif' },
    })

    expect(palette.bodyFont).not.toContain('"')
    expect(palette.bodyFont).toContain("'Segoe UI'")
  })

  it('keeps light and dark apart', () => {
    const palette = mailPalette(TOKENS)
    expect(palette.light.page).not.toBe(palette.dark.page)
    expect(palette.light.text).not.toBe(palette.dark.text)
  })

  it('drops the var() segments of a font stack no mail client can resolve', () => {
    const palette = mailPalette(TOKENS)
    expect(palette.bodyFont).not.toContain('var(')
    expect(palette.bodyFont).toContain('ui-sans-serif')
    expect(palette.bodyFont).toContain('sans-serif')
  })

  it('follows a token that only points at another token', () => {
    expect(mailPalette(TOKENS).headingFont).toBe(mailPalette(TOKENS).bodyFont)
  })

  it('reads the radius in pixels, which is the unit mail understands', () => {
    expect(mailPalette(TOKENS).radius).toBe(8)
    expect(mailPalette({ ...TOKENS, light: { ...TOKENS.light, radius: '2px' } }).radius).toBe(2)
    expect(mailPalette({ ...TOKENS, light: { ...TOKENS.light, radius: '9rem' } }).radius).toBe(20)
  })

  it('falls back per token rather than abandoning the whole palette', () => {
    const broken = mailPalette({
      ...TOKENS,
      light: { ...TOKENS.light, primary: 'color-mix(in oklch, red, blue)' },
    })

    expect(broken.light.primary).toBe(FALLBACK_PALETTE.light.primary)
    expect(broken.light.card).toBe('#ffffff')
  })

  it('has a palette to fall back to when no theme could be read at all', () => {
    expect(mailPalette(null)).toEqual(FALLBACK_PALETTE)
  })
})

describe('mergeTokenOverrides', () => {
  it('applies a scheme-shaped override to the matching scheme only', () => {
    const merged = mergeTokenOverrides(TOKENS, { light: { primary: '#ff0000' } })

    expect(merged.light.primary).toBe('#ff0000')
    expect(merged.dark.primary).toBe(TOKENS.dark.primary)
  })

  it('applies a flat override to both schemes, as the stylesheet does', () => {
    const merged = mergeTokenOverrides(TOKENS, { primary: '#ff0000' })

    expect(merged.light.primary).toBe('#ff0000')
    expect(merged.dark.primary).toBe('#ff0000')
  })

  it('ignores anything that is not a string, rather than rendering "[object Object]"', () => {
    const merged = mergeTokenOverrides(TOKENS, { primary: { l: 1 }, border: '  ' })

    expect(merged.light.primary).toBe(TOKENS.light.primary)
    expect(merged.light.border).toBe(TOKENS.light.border)
  })

  it('keeps the baseline when the stored overrides are not an object', () => {
    expect(mergeTokenOverrides(TOKENS, null)).toEqual(TOKENS)
    expect(mergeTokenOverrides(TOKENS, 'nonsense')).toEqual(TOKENS)
    expect(mergeTokenOverrides(TOKENS, [])).toEqual(TOKENS)
  })
})
