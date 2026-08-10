import { describe, expect, it } from 'vitest'

import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS } from '@meith/theme-default'

import {
  colorToHex,
  groupNameClass,
  renderBoardStyle,
  renderGroupNameStyle,
  renderThemeStyle,
  validateCustomCss,
  validateTokenOverrides,
} from './theme-style'

const tokens = { light: LIGHT_TOKENS, dark: DARK_TOKENS }
const baseline = { light: LIGHT_TOKENS, dark: DARK_TOKENS }

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

  describe('a theme whose values are not the compiled ones', () => {
    it('emits only the tokens that differ from the stylesheet', () => {
      const { css } = renderThemeStyle(midnight, undefined, null, baseline)

      expect(css).toContain(':root{--background:#101820;--primary:#33cccc;}')
      expect(css).toContain(`.dark{--background:#05080b;--primary:${DARK_TOKENS.primary};}`)
      expect(css).not.toContain('--foreground')
    })

    it('emits nothing when the theme is the one the stylesheet carries', () => {
      expect(renderThemeStyle(tokens, undefined, null, tokens).css).toBe('')
    })

    it('puts the board override in place of the theme default', () => {
      const { css } = renderThemeStyle(midnight, { primary: '#ff0000' }, null, baseline)

      expect(css).toContain('--primary:#ff0000;')
      expect(css).not.toContain('--primary:#33cccc;')
    })

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

    it('restates the theme’s dark value when only light is overridden', () => {
      const { css } = renderThemeStyle(tokens, { light: { primary: '#0a58ca' }, dark: {} }, null)

      expect(css).toContain(':root{--primary:#0a58ca;}')
      expect(css).toContain(`.dark{--primary:${DARK_TOKENS.primary};}`)
      expect(css).toContain(
        `@media (prefers-color-scheme: dark){:root:not(.light){--primary:${DARK_TOKENS.primary};}}`,
      )
    })

    it('says nothing in light when only dark is overridden', () => {
      const { css } = renderThemeStyle(tokens, { light: {}, dark: { primary: '#6ea8fe' } }, null)

      expect(css.startsWith('.dark{--primary:#6ea8fe;}')).toBe(true)
    })

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
    expect(colorToHex(LIGHT_TOKENS.background)).toBe(BROWSER_THEME_COLOR.light)
    expect(colorToHex(DARK_TOKENS.background)).toBe(BROWSER_THEME_COLOR.dark)
  })

  it('rejects stylesheet escapes and external fetches in custom CSS', () => {
    expect(validateCustomCss('.forum-row { font-weight: 600; }')).toContain('font-weight')
    expect(() => validateCustomCss('</style><script>')).toThrow(/unsafe/)
    expect(() => validateCustomCss('@import "https://example.test/a.css"')).toThrow(/unsafe/)
  })
})

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
    const scoped = `--background:#05080b;--primary:${DARK_TOKENS.primary};`
    expect(css).toContain(`.dark[data-theme="midnight"]{${scoped}}`)
    expect(css).toContain(
      `@media (prefers-color-scheme: dark){:root[data-theme="midnight"]:not(.light){${scoped}}}`,
    )
  })

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
    const one = renderBoardStyle({
      themes: [{ key: 'default', tokens, overrides: { primary: '#123456' }, customCss: null }],
      defaultKey: 'default',
      baseline,
    })

    expect(one.css).toBe(renderThemeStyle(tokens, { primary: '#123456' }, null, baseline).css)
    expect(one.css).not.toContain('data-theme')
  })

  it('nests an alternate theme’s custom CSS under its selector, and leaves the default’s flat', () => {
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

describe('renderGroupNameStyle', () => {
  const RED = 'oklch(0.55 0.2 25)'
  const PINK = 'oklch(0.8 0.15 25)'

  it('is empty for a board that has coloured nothing', () => {
    expect(renderGroupNameStyle([])).toBe('')
    expect(renderGroupNameStyle([{ groupId: 4, light: null, dark: null }])).toBe('')
  })

  it('outranks a single utility class', () => {
    const css = renderGroupNameStyle([{ groupId: 4, light: RED, dark: null }])

    const selector = `.${groupNameClass(4)}`
    expect(css).toContain(`${selector}${selector}{color:${RED};}`)
    expect(css).not.toContain(`}${selector}{`)
  })

  it('covers the reader on "system" as well as the one who chose dark', () => {
    const css = renderGroupNameStyle([{ groupId: 4, light: RED, dark: PINK }])

    expect(css).toContain(`.dark .${groupNameClass(4)}`)
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(`:root:not(.light) .${groupNameClass(4)}`)
  })

  it('emits no media query for a board with only light colours', () => {
    const css = renderGroupNameStyle([{ groupId: 4, light: RED, dark: null }])
    expect(css).not.toContain('@media')
  })

  it('refuses a colour that would close the declaration', () => {
    expect(() =>
      renderGroupNameStyle([{ groupId: 4, light: 'red;} body{display:none', dark: null }]),
    ).toThrow(/unsafe/)
    expect(() =>
      renderGroupNameStyle([{ groupId: 4, light: null, dark: '</style><script>' }]),
    ).toThrow(/unsafe/)
  })
})
