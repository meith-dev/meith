import { describe, expect, it } from 'vitest'

import { DARK_TOKENS, LIGHT_TOKENS } from '@forum/theme-default'

import {
  colorToHex,
  renderThemeStyle,
  validateCustomCss,
  validateTokenOverrides,
} from './theme-style'

const tokens = { light: LIGHT_TOKENS, dark: DARK_TOKENS }

describe('theme runtime style', () => {
  it('overrides declared tokens after both colour-scheme defaults', () => {
    expect(renderThemeStyle(tokens, { primary: '#123456' }, null).css).toBe(
      ':root{--primary:#123456;}.dark{--primary:#123456;}@media (prefers-color-scheme: dark){:root:not(.light){--primary:#123456;}}',
    )
  })

  /*
   * F78. `globals.css` compiles one theme's values, so a second theme's palette
   * has to arrive in the page or it does not arrive at all — and until this
   * existed, installing a second theme gave you its markup in the first theme's
   * colours, with nothing failing anywhere.
   */
  describe('a theme whose values are not the compiled ones', () => {
    const midnight = {
      light: { ...LIGHT_TOKENS, background: '#101820', primary: '#33cccc' },
      dark: { ...DARK_TOKENS, background: '#05080b' },
    }

    it('emits only the tokens that differ from the stylesheet', () => {
      const { css } = renderThemeStyle(midnight, undefined, null, { light: LIGHT_TOKENS, dark: DARK_TOKENS })

      expect(css).toContain(':root{--background:#101820;--primary:#33cccc;}')
      expect(css).toContain('.dark{--background:#05080b;}')
      /* Unchanged tokens are left to the stylesheet rather than restated. */
      expect(css).not.toContain('--foreground')
    })

    it('emits nothing when the theme is the one the stylesheet carries', () => {
      const tokens = { light: LIGHT_TOKENS, dark: DARK_TOKENS }
      expect(renderThemeStyle(tokens, undefined, null, tokens).css).toBe('')
    })

    /*
     * The cascade, and the reason the order is not arbitrary: a board's explicit
     * override must beat the theme's own value. Emitting them the other way
     * round inverts F26's rule while looking identical in a diff.
     */
    it('puts the board override after the theme default', () => {
      const { css } = renderThemeStyle(midnight, { primary: '#ff0000' }, null, {
        light: LIGHT_TOKENS,
        dark: DARK_TOKENS,
      })

      expect(css.indexOf('--primary:#33cccc')).toBeLessThan(css.indexOf('--primary:#ff0000'))
    })

    /* A theme is a module, but its values still reach a <style> block. */
    it('refuses a theme token that would smuggle a second declaration', () => {
      expect(() =>
        renderThemeStyle({ ...midnight, light: { ...midnight.light, primary: '#fff;color:red' } }, undefined, null, {
          light: LIGHT_TOKENS,
          dark: DARK_TOKENS,
        }),
      ).toThrow(/unsafe/)
    })
  })

  it('rejects unknown tokens and declaration injection', () => {
    expect(() => validateTokenOverrides(tokens, { invented: '#123456' })).toThrow(/not declared/)
    expect(() => validateTokenOverrides(tokens, { primary: '#123456; color:red' })).toThrow(/unsafe/)
  })

  it('derives browser chrome colours from the effective background', () => {
    expect(renderThemeStyle(tokens, { background: '#102030' }, null).browserThemeColor).toEqual({
      light: '#102030',
      dark: '#102030',
    })
    expect(colorToHex(LIGHT_TOKENS.background)).toBe('#f6f7f8')
    expect(colorToHex(DARK_TOKENS.background)).toBe('#121417')
  })

  it('rejects stylesheet escapes and external fetches in custom CSS', () => {
    expect(validateCustomCss('.forum-row { font-weight: 600; }')).toContain('font-weight')
    expect(() => validateCustomCss('</style><script>')).toThrow(/unsafe/)
    expect(() => validateCustomCss('@import "https://example.test/a.css"')).toThrow(/unsafe/)
  })
})
