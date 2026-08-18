import { describe, expect, it } from 'vitest'

import { oklchToRgb, parseColour, rgbToOklch } from '@meith/theme-kit'

import { DARK_TOKENS, LIGHT_TOKENS } from './tokens'

describe('the tokens the default theme ships', () => {
  it('survives OKLCH → sRGB → OKLCH, so mail and meta tags can render them as hex', () => {
    for (const value of [...Object.values(LIGHT_TOKENS), ...Object.values(DARK_TOKENS)]) {
      const parsed = parseColour(value)
      if (parsed === null) continue

      const { rgb, inGamut } = oklchToRgb(parsed)
      expect(inGamut, value).toBe(true)

      const back = rgbToOklch(rgb)
      expect(back.l, `${value} lightness`).toBeCloseTo(parsed.l, 2)
      expect(back.c, `${value} chroma`).toBeCloseTo(parsed.c, 2)
      if (parsed.c > 0.01) expect(back.h, `${value} hue`).toBeCloseTo(parsed.h, 0)
    }
  })
})
