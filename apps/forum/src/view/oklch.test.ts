/**
 * The colour arithmetic the picker and `<meta name="theme-color">` share.
 *
 * Two properties carry this file. The first is that a round trip does not
 * drift — an operator who opens the picker on a stored value and closes it
 * without touching anything must get the same string back, or every save
 * quietly walks the palette. The second is that being *outside sRGB* is
 * reported rather than clamped away, because a chroma slider that stops
 * meaning anything without saying so is worse than one that refuses to move.
 */
import { describe, expect, it } from 'vitest'

import { DARK_TOKENS, LIGHT_TOKENS } from '@meith/theme-default'

import {
  colourToHex,
  formatOklch,
  oklchToRgb,
  parseColour,
  parseHex,
  rgbToHex,
  rgbToOklch,
} from './oklch'

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
  /*
   * The property the editor depends on. Opening the picker parses the stored
   * string into three numbers and closing it formats them back; if that is not
   * stable, every visit to the theme screen nudges the palette.
   */
  it('survives OKLCH → sRGB → OKLCH for every token the default theme ships', () => {
    for (const value of [...Object.values(LIGHT_TOKENS), ...Object.values(DARK_TOKENS)]) {
      const parsed = parseColour(value)
      if (parsed === null) continue /* radius, the font stack — not colours. */

      const { rgb, inGamut } = oklchToRgb(parsed)
      expect(inGamut, value).toBe(true)

      const back = rgbToOklch(rgb)
      expect(back.l, `${value} lightness`).toBeCloseTo(parsed.l, 2)
      expect(back.c, `${value} chroma`).toBeCloseTo(parsed.c, 2)
      /* Hue is unstable at zero chroma and meaningless there — the greys. */
      if (parsed.c > 0.01) expect(back.h, `${value} hue`).toBeCloseTo(parsed.h, 0)
    }
  })

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
  /*
   * OKLCH describes colours no ordinary screen can show. Reporting that is the
   * difference between a picker whose chroma slider visibly stops working and
   * one that tells you why.
   */
  it('reports a colour sRGB cannot hold', () => {
    expect(oklchToRgb({ l: 0.7, c: 0.3, h: 150 }).inGamut).toBe(false)
    expect(oklchToRgb({ l: 0.5, c: 0.13, h: 264 }).inGamut).toBe(true)
  })

  it('still returns a usable colour when it is out of gamut', () => {
    /* Clamped, so the swatch shows the nearest thing the screen can do. */
    const { rgb } = oklchToRgb({ l: 0.7, c: 0.3, h: 150 })
    for (const channel of [rgb.r, rgb.g, rgb.b]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  it('reads pure greys as zero chroma with no phantom hue', () => {
    /*
     * `atan2(0, 0)` is 0 but the inputs are floating point, so a grey can come
     * back with a hue of 180 and a chroma of 1e-9 — which shows up as a picker
     * whose hue slider jumps somewhere arbitrary the moment you touch chroma.
     */
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
