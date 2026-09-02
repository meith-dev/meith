import { describe, expect, it } from 'vitest'

import { comboboxKeyAction } from './combobox-keys'

function press(
  key: string,
  state: { count: number; active: number },
  modifiers: { meta?: boolean; ctrl?: boolean } = {},
) {
  return comboboxKeyAction(
    { key, metaKey: modifiers.meta ?? false, ctrlKey: modifiers.ctrl ?? false },
    state,
  )
}

describe('comboboxKeyAction', () => {
  it('does nothing when the list is closed, so keys fall through to the field', () => {
    expect(press('ArrowDown', { count: 0, active: 0 })).toBeNull()
    expect(press('Enter', { count: 0, active: 0 })).toBeNull()
    expect(press('Escape', { count: 0, active: 0 })).toBeNull()
  })

  it('moves the highlight down and wraps past the last option', () => {
    expect(press('ArrowDown', { count: 3, active: 0 })).toEqual({ type: 'move', active: 1 })
    expect(press('ArrowDown', { count: 3, active: 2 })).toEqual({ type: 'move', active: 0 })
  })

  it('moves the highlight up and wraps past the first option', () => {
    expect(press('ArrowUp', { count: 3, active: 2 })).toEqual({ type: 'move', active: 1 })
    expect(press('ArrowUp', { count: 3, active: 0 })).toEqual({ type: 'move', active: 2 })
  })

  it('chooses the highlighted option on Enter or Tab', () => {
    expect(press('Enter', { count: 3, active: 1 })).toEqual({ type: 'choose', index: 1 })
    expect(press('Tab', { count: 3, active: 2 })).toEqual({ type: 'choose', index: 2 })
  })

  it('dismisses the list on Escape', () => {
    expect(press('Escape', { count: 3, active: 1 })).toEqual({ type: 'dismiss' })
  })

  it('leaves modified Enter and Tab alone, so submit and focus shortcuts still work', () => {
    expect(press('Enter', { count: 3, active: 1 }, { meta: true })).toBeNull()
    expect(press('Enter', { count: 3, active: 1 }, { ctrl: true })).toBeNull()
    expect(press('Tab', { count: 3, active: 1 }, { ctrl: true })).toBeNull()
  })

  it('ignores keys it does not own', () => {
    expect(press('a', { count: 3, active: 0 })).toBeNull()
    expect(press('ArrowLeft', { count: 3, active: 0 })).toBeNull()
  })
})
