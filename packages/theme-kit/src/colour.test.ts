import { describe, expect, it } from 'vitest'

import {
  colourToHex,
  formatOklch,
  oklchToRgb,
  parseColour,
  parseHex,
  rgbToHex,
  rgbToOklch,
} from './colour'

describe('parseColour', () => {
  it('reads the two notations the board stores', () => {
    expect(parseColour('oklch(0.5 0.1 250)')).toEqual({ l: 0.5, c: 0.1, h: 250 })
    expect(parseColour('#ffffff')?.l).toBeCloseTo(1, 3)
  })

  it('reads a percentage lightness, which is what a design tool pastes', () => {
    const parsed = parseColour('oklch(50% 0.1 250)')
    expect(parsed?.l).toBeCloseTo(0.5, 6)
  })

  it('expands the three-digit hex form', () => {
    expect(parseHex('#abc')).toEqual(parseHex('#aabbcc'))
  })

  it('refuses anything else, rather than guessing', () => {
    expect(parseColour('rebeccapurple')).toBeNull()
    expect(parseColour('rgb(1,2,3)')).toBeNull()
    expect(parseColour('')).toBeNull()
  })
})

describe('round trips', () => {
  it('survives hex → OKLCH → hex exactly', () => {
    for (const hex of ['#000000', '#ffffff', '#3b5998', '#1d4ed8', '#fcd34d']) {
      expect(rgbToHex(oklchToRgb(rgbToOklch(parseHex(hex)!)).rgb), hex).toBe(hex)
    }
  })

  it('formats a value the parser reads back unchanged', () => {
    const formatted = formatOklch({ l: 0.4912, c: 0.1339, h: 264.44 })
    expect(formatted).toBe('oklch(0.491 0.134 264.4)')
    expect(parseColour(formatted)).toEqual({ l: 0.491, c: 0.134, h: 264.4 })
  })
})

describe('gamut', () => {
  it('reports a colour sRGB cannot hold', () => {
    expect(oklchToRgb({ l: 0.7, c: 0.3, h: 150 }).inGamut).toBe(false)
    expect(oklchToRgb({ l: 0.5, c: 0.13, h: 264 }).inGamut).toBe(true)
  })

  it('still returns a usable colour when it is out of gamut', () => {
    const { rgb } = oklchToRgb({ l: 0.7, c: 0.3, h: 150 })
    for (const channel of [rgb.r, rgb.g, rgb.b]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  it('reads pure greys as zero chroma with no phantom hue', () => {
    const grey = rgbToOklch(parseHex('#808080')!)
    expect(grey.c).toBeLessThan(0.001)
    expect(grey.h).toBe(0)
  })
})

describe('colourToHex', () => {
  it('is what <meta name="theme-color"> gets, in either notation', () => {
    expect(colourToHex('#AABBCC')).toBe('#aabbcc')
    expect(colourToHex('oklch(1 0 0)')).toBe('#ffffff')
    expect(colourToHex('oklch(0 0 0)')).toBe('#000000')
    expect(colourToHex('not a colour')).toBeNull()
  })
})
