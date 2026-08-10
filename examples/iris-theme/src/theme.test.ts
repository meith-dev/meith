import { TOKEN_NAMES, defaultTheme } from '@meith/theme-default'
import { assertThemeContract, resolveTheme } from '@meith/theme-kit'
import { describe, expect, it } from 'vitest'

import { irisTheme } from './theme'
import { DARK_TOKENS, LIGHT_TOKENS } from './tokens'

describe('the iris theme', () => {
  it('satisfies the theme-kit contract', () => {
    expect(assertThemeContract(resolveTheme(irisTheme)).missing).toEqual([])
  })

  it('inherits from the default theme rather than copying it', () => {
    expect(resolveTheme(irisTheme).chain).toEqual(['iris', 'default'])
  })

  it('overrides exactly one slot: the footer', () => {
    expect(Object.keys(irisTheme.slots)).toEqual(['Footer'])
    expect(irisTheme.slots.Footer).not.toBe(defaultTheme.slots.Footer)
  })

  it('declares a value for every token the theme layer names', () => {
    for (const name of TOKEN_NAMES) {
      expect(LIGHT_TOKENS[name], `light ${name}`).toBeDefined()
      expect(DARK_TOKENS[name], `dark ${name}`).toBeDefined()
    }
  })

  it('recolours the brand group and nothing greyscale', () => {
    expect(LIGHT_TOKENS.primary).not.toBe(DARK_TOKENS.primary)
    expect(LIGHT_TOKENS.background).toBe('oklch(0.968 0 0)')
    expect(DARK_TOKENS.background).toBe('oklch(0.15 0 0)')
  })
})
