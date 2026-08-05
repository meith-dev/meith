import { describe, expect, it } from 'vitest'

import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS } from '@meith/theme-default'

import {
  colorToHex,
  renderBoardStyle,
  renderThemeStyle,
  validateCustomCss,
  validateTokenOverrides,
} from './theme-style'

const tokens = { light: LIGHT_TOKENS, dark: DARK_TOKENS }
const baseline = { light: LIGHT_TOKENS, dark: DARK_TOKENS }

/** A second theme: a different page colour, and a brand the default has not got. */
const midnight = {
  light: { ...LIGHT_TOKENS, background: '#101820', primary: '#33cccc' },
  dark: { ...DARK_TOKENS, background: '#05080b' },
}

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
    it('emits only the tokens that differ from the stylesheet', () => {
      const { css } = renderThemeStyle(midnight, undefined, null, baseline)

      expect(css).toContain(':root{--background:#101820;--primary:#33cccc;}')
      expect(css).toContain('.dark{--background:#05080b;}')
      /* Unchanged tokens are left to the stylesheet rather than restated. */
      expect(css).not.toContain('--foreground')
    })

    it('emits nothing when the theme is the one the stylesheet carries', () => {
      expect(renderThemeStyle(tokens, undefined, null, tokens).css).toBe('')
    })

    /*
     * The cascade, and the reason the order is not arbitrary: a board's explicit
     * override must beat the theme's own value. Emitting them the other way
     * round inverts F26's rule while looking identical in a diff.
     */
    it('puts the board override in place of the theme default', () => {
      const { css } = renderThemeStyle(midnight, { primary: '#ff0000' }, null, baseline)

      expect(css).toContain('--primary:#ff0000;')
      expect(css).not.toContain('--primary:#33cccc;')
    })

    /* A theme is a module, but its values still reach a <style> block. */
    it('refuses a theme token that would smuggle a second declaration', () => {
      expect(() =>
        renderThemeStyle(
          { ...midnight, light: { ...midnight.light, primary: '#fff;color:red' } },
          undefined,
          null,
          baseline,
        ),
      ).toThrow(/unsafe/)
    })
  })

  describe('overrides that differ between light and dark', () => {
    it('reads the scheme-keyed shape', () => {
      const { css } = renderThemeStyle(
        tokens,
        { light: { primary: '#0a58ca' }, dark: { primary: '#6ea8fe' } },
        null,
      )

      expect(css).toContain(':root{--primary:#0a58ca;}')
      expect(css).toContain('.dark{--primary:#6ea8fe;}')
    })

    /*
     * Every row written before members could switch themes holds the flat map,
     * and it meant "both schemes". Reading it as anything else would repaint
     * every already-customised board on the deploy that shipped this.
     */
    it('reads the flat shape as both schemes', () => {
      expect(validateTokenOverrides(tokens, { primary: '#123456' })).toEqual({
        light: { primary: '#123456' },
        dark: { primary: '#123456' },
      })
    })

    it('rejects an unsafe value in either scheme', () => {
      expect(() =>
        validateTokenOverrides(tokens, { light: {}, dark: { primary: '#fff;color:red' } }),
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
    /*
     * Against `BROWSER_THEME_COLOR`, not against two literals.
     *
     * This assertion used to name the palette's hexes, and a redesign of the
     * default theme therefore failed it — which is a test reporting a change it
     * has no opinion about. The property worth holding is that
     * `<meta name="theme-color">` is the `background` token converted, so that
     * the pair cannot go stale by hand; which two greys the theme happens to
     * ship is `tokens.test.ts`'s business, where the CSS is compared with it.
     */
    expect(colorToHex(LIGHT_TOKENS.background)).toBe(BROWSER_THEME_COLOR.light)
    expect(colorToHex(DARK_TOKENS.background)).toBe(BROWSER_THEME_COLOR.dark)
  })

  it('rejects stylesheet escapes and external fetches in custom CSS', () => {
    expect(validateCustomCss('.forum-row { font-weight: 600; }')).toContain('font-weight')
    expect(() => validateCustomCss('</style><script>')).toThrow(/unsafe/)
    expect(() => validateCustomCss('@import "https://example.test/a.css"')).toThrow(/unsafe/)
  })
})

/**
 * The cascade a board with a switcher ships.
 *
 * The property every test here is circling: **an alternate theme's block must
 * restate everything it disagrees with the default about, and nothing else.**
 * Too little and one theme's brand colour leaks into another's palette with
 * nothing failing; too much and every page carries a second full palette for no
 * reason.
 */
describe('renderBoardStyle', () => {
  const board = (overrides?: {
    defaultOverrides?: unknown
    midnightOverrides?: unknown
    defaultCss?: string | null
    midnightCss?: string | null
  }) =>
    renderBoardStyle({
      themes: [
        {
          key: 'default',
          tokens,
          overrides: overrides?.defaultOverrides,
          customCss: overrides?.defaultCss ?? null,
        },
        {
          key: 'midnight',
          tokens: midnight,
          overrides: overrides?.midnightOverrides,
          customCss: overrides?.midnightCss ?? null,
        },
      ],
      defaultKey: 'default',
      baseline,
    })

  it('leaves the default theme unscoped, so first paint needs no script', () => {
    const { css } = board({ defaultOverrides: { primary: '#0a58ca' } })
    expect(css.startsWith(':root{--primary:#0a58ca;}')).toBe(true)
  })

  it('scopes every other theme to its own attribute', () => {
    const { css } = board()

    expect(css).toContain(':root[data-theme="midnight"]{--background:#101820;--primary:#33cccc;}')
    expect(css).toContain('.dark[data-theme="midnight"]{--background:#05080b;}')
    expect(css).toContain(
      '@media (prefers-color-scheme: dark){:root[data-theme="midnight"]:not(.light){--background:#05080b;}}',
    )
  })

  /*
   * The one that matters, and the one a simpler implementation gets wrong.
   *
   * The default's override is unscoped, so it is still in force when a member
   * has picked another theme. Midnight's block must therefore restate
   * `foreground` — a token midnight leaves exactly as the *stylesheet* has it,
   * and which is nonetheless changed from what the page is actually painting.
   * A renderer that diffed against the compiled baseline instead would emit
   * nothing here and paint midnight's body text in the default theme's brand.
   */
  it('restates a token the default overrides and the alternate does not', () => {
    const { css } = board({ defaultOverrides: { foreground: '#ff0000' } })

    const scoped = css.slice(css.indexOf(':root[data-theme="midnight"]'))
    expect(scoped).toContain(`--foreground:${LIGHT_TOKENS.foreground};`)
  })

  it('says nothing about a token two themes agree on', () => {
    const { css } = board()
    const scoped = css.slice(css.indexOf(':root[data-theme="midnight"]'))
    expect(scoped).not.toContain('--foreground')
  })

  it('emits what it always emitted when only one theme is enabled', () => {
    /*
     * The common case has to stay free. A board with one theme pays not one
     * byte for the fact that switching exists.
     */
    const one = renderBoardStyle({
      themes: [{ key: 'default', tokens, overrides: { primary: '#123456' }, customCss: null }],
      defaultKey: 'default',
      baseline,
    })

    expect(one.css).toBe(renderThemeStyle(tokens, { primary: '#123456' }, null, baseline).css)
    expect(one.css).not.toContain('data-theme')
  })

  it('nests an alternate theme’s custom CSS under its selector, and leaves the default’s flat', () => {
    /*
     * Custom CSS has to stop applying the moment a member picks a different
     * theme, and its rules are arbitrary author CSS this code has no business
     * rewriting — native nesting is the only tool that does both.
     */
    const { css } = board({ defaultCss: '.a{color:red}', midnightCss: '.b{color:blue}' })

    expect(css).toContain('.a{color:red}')
    expect(css).toContain(':root[data-theme="midnight"]{.b{color:blue}}')
  })

  it('takes the browser chrome colour from the default theme', () => {
    const { browserThemeColor } = board()
    expect(browserThemeColor.light).toBe(BROWSER_THEME_COLOR.light)
  })

  it('refuses a theme key that could not be written into a selector', () => {
    expect(() =>
      renderBoardStyle({
        themes: [
          { key: 'default', tokens, overrides: undefined, customCss: null },
          { key: 'a"]{}', tokens: midnight, overrides: undefined, customCss: null },
        ],
        defaultKey: 'default',
        baseline,
      }),
    ).toThrow(/selector/)
  })

  it('refuses to render a board whose default is not among its themes', () => {
    expect(() =>
      renderBoardStyle({
        themes: [{ key: 'midnight', tokens: midnight, overrides: undefined, customCss: null }],
        defaultKey: 'default',
        baseline,
      }),
    ).toThrow(/not among/)
  })
})
