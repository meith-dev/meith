import { describe, expect, it } from 'vitest'

import { type BrandInfo, brandInitials, buildFaviconSvg, trimDescription } from './brand-assets'

const palette = {
  background: '#ffffff',
  foreground: '#111111',
  primary: '#0a7',
  primaryForeground: '#fff',
  muted: '#666666',
  border: '#dddddd',
} as const

function info(overrides: Partial<BrandInfo> = {}): BrandInfo {
  return {
    title: 'Townland',
    description: '',
    initials: 'T',
    light: palette,
    dark: { ...palette, background: '#111111', foreground: '#eeeeee' },
    ...overrides,
  }
}

describe('brandInitials', () => {
  it('takes the first letter of a single-word name', () => {
    expect(brandInitials('Meith')).toBe('M')
  })

  it('takes the first letter of the first two words', () => {
    expect(brandInitials('The Townland')).toBe('TT')
    expect(brandInitials('  Acme   Community   Forum ')).toBe('AC')
  })

  it('uppercases without depending on the host locale', () => {
    expect(brandInitials('istanbul')).toBe('I')
  })

  it('reads whole code points, not UTF-16 halves', () => {
    expect(brandInitials('🍁 Maple')).toBe('🍁M')
  })

  it('falls back to a placeholder for an empty name', () => {
    expect(brandInitials('   ')).toBe('?')
  })
})

describe('trimDescription', () => {
  it('keeps a short description as it is', () => {
    expect(trimDescription('  A friendly place  ')).toBe('A friendly place')
  })

  it('ellipsises an over-long description', () => {
    const long = 'x'.repeat(400)
    const trimmed = trimDescription(long)

    expect(trimmed.length).toBeLessThanOrEqual(160)
    expect(trimmed.endsWith('…')).toBe(true)
  })
})

describe('buildFaviconSvg', () => {
  it('paints the mark in the theme primary colour for each scheme', () => {
    const svg = buildFaviconSvg(info({ initials: 'TT' }))

    expect(svg).toContain(`.brand-bg{fill:${palette.primary}}`)
    expect(svg).toContain('prefers-color-scheme:dark')
    expect(svg).toContain('>TT</text>')
  })

  it('escapes the initials so they cannot break the markup', () => {
    const svg = buildFaviconSvg(info({ initials: '<&' }))

    expect(svg).toContain('&lt;&amp;')
    expect(svg).not.toContain('<&')
  })
})
