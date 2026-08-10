import { assertThemeContract, resolveTheme, SLOT_STABILITY, SLOT_NAMES } from '@meith/theme-kit'
import { describe, expect, it } from 'vitest'

import { defaultTheme } from './theme'

describe('the default theme', () => {
  it('satisfies the theme-kit contract', () => {
    const report = assertThemeContract(resolveTheme(defaultTheme))
    expect(report.missing).toEqual([])
  })

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
