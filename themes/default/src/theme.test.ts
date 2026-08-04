import { assertThemeContract, resolveTheme, SLOT_STABILITY, SLOT_NAMES } from '@meith/theme-kit'
import { describe, expect, it } from 'vitest'

import { defaultTheme } from './theme'

/**
 * The board's own theme, held against the contract it is the reference
 * implementation of (F77).
 *
 * `apps/forum/src/server/theme.ts` makes the same assertion at module load, so a
 * hole in the theme already fails a boot. This one fails `pnpm test`, which is
 * the gate somebody actually runs before pushing — and it names the theme rather
 * than the app, which is where the fix goes.
 */
describe('the default theme', () => {
  it('satisfies theme-kit v1', () => {
    const report = assertThemeContract(resolveTheme(defaultTheme))
    expect(report.missing).toEqual([])
  })

  /*
   * Incomplete, deliberately, and pinned so it stays deliberate: the two
   * unfilled slots are F45's editor islands and no more. A third name appearing
   * here is a page whose region silently stopped being themed.
   */
  it('fills every slot except the two provisional islands', () => {
    expect(resolveTheme(defaultTheme).missing).toEqual(['QuickReply', 'EditorToolbar'])
  })

  it('fills nothing the registry does not name', () => {
    for (const name of Object.keys(defaultTheme.slots)) {
      expect(SLOT_NAMES).toContain(name)
      expect(SLOT_STABILITY[name as keyof typeof SLOT_STABILITY]).toBeDefined()
    }
  })
})
