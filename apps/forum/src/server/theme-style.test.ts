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
