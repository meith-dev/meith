import { describe, expect, it } from 'vitest'

import { SLOTS, SLOT_NAMES, isSlotName, slotKind } from './slots'

describe('the slot registry', () => {
  it('names every slot exactly once', () => {
    expect(new Set(SLOT_NAMES).size).toBe(SLOT_NAMES.length)
    expect(SLOT_NAMES.length).toBe(Object.keys(SLOTS).length)
  })

  it('gives every slot a kind, a feature and a purpose', () => {
    for (const name of SLOT_NAMES) {
      const spec = SLOTS[name]
      expect(['server', 'client']).toContain(spec.kind)
      expect(spec.feature).toMatch(/^F\d\d$/)
      expect(spec.purpose.length).toBeGreaterThan(20)
    }
  })

  it('keeps PostBit on the server', () => {
    expect(slotKind('PostBit')).toBe('server')
  })

  it('has exactly two client slots, both editor islands', () => {
    const clientSlots = SLOT_NAMES.filter((name) => SLOTS[name].kind === 'client')
    expect([...clientSlots].sort()).toEqual(['EditorToolbar', 'QuickReply'])
  })

  it('recognises a real slot name and rejects a typo', () => {
    expect(isSlotName('PostBit')).toBe(true)
    expect(isSlotName('Postbit')).toBe(false)
    expect(isSlotName('__proto__')).toBe(false)
  })
})
