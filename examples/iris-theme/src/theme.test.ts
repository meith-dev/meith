/**
 * What is true of *this* theme.
 *
 * The rendering-contract suite (`apps/forum/src/theme/contract.test.ts`) and
 * the contrast gate (`apps/forum/src/view/contrast.test.ts`) both read the
 * theme list out of `forum.config.ts`, so registering iris enrolled it in both
 * — every stable slot renders, every painted pair clears WCAG AA. What is here
 * is what those suites cannot see: the shape iris claims for itself.
 */
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

  /*
   * A recolour that accidentally overrode a slot it has no opinion about would
   * stop receiving the default's fixes for it. One slot is the claim this
   * theme makes; this notices when the count drifts from the claim.
   */
  it('overrides exactly one slot: the footer', () => {
    expect(Object.keys(irisTheme.slots)).toEqual(['Footer'])
    expect(irisTheme.slots.Footer).not.toBe(defaultTheme.slots.Footer)
  })

  /*
   * Spreading the default's records is how iris stays total: a token added
   * upstream arrives with the default's value rather than as a hole. Asserted
   * against the declared name list so a spread that stopped covering it —
   * say, after a refactor to hand-written records — fails by name.
   */
  it('declares a value for every token the theme layer names', () => {
    for (const name of TOKEN_NAMES) {
      expect(LIGHT_TOKENS[name], `light ${name}`).toBeDefined()
      expect(DARK_TOKENS[name], `dark ${name}`).toBeDefined()
    }
  })

  /* The brand group is the difference; the ground stays the default's. */
  it('recolours the brand group and nothing greyscale', () => {
    expect(LIGHT_TOKENS.primary).not.toBe(DARK_TOKENS.primary)
    expect(LIGHT_TOKENS.background).toBe('oklch(0.968 0 0)')
    expect(DARK_TOKENS.background).toBe('oklch(0.15 0 0)')
  })
})
