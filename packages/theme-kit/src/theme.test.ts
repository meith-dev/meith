import { describe, expect, it } from 'vitest'

import { sourceTranslator } from '@meith/i18n'

import { SLOT_NAMES, type SlotName } from './slots'
import {
  assertComplete,
  defineTheme,
  hasSlot,
  type PartialSlotImplementations,
  requireSlot,
  resolveTheme,
  type SlotComponent,
  slotCopy,
  type ThemeDefinition,
} from './theme'

const t = sourceTranslator({ 'stub.greeting': 'Hello' })

function stub(label: string) {
  const component = () => label
  Object.defineProperty(component, 'name', { value: label })
  return component
}

function clientReference(name: string) {
  return {
    $$typeof: Symbol.for('react.client.reference'),
    name,
  } as unknown as SlotComponent<'QuickReply'>
}

function everySlot(): PartialSlotImplementations {
  const slots: Record<string, unknown> = {}
  for (const name of SLOT_NAMES) slots[name] = stub(name)
  return slots as PartialSlotImplementations
}

describe('defineTheme', () => {
  it('accepts a theme that fills some slots', () => {
    const theme = defineTheme({
      key: 'base',
      title: 'Base',
      slots: { Header: stub('base header') },
    })

    expect(theme.key).toBe('base')
  })

  it('rejects an empty key or title', () => {
    expect(() => defineTheme({ key: '  ', title: 'X', slots: {} })).toThrow(/key must not be empty/)
    expect(() => defineTheme({ key: 'x', title: '', slots: {} })).toThrow(/must have a title/)
  })

  it('rejects an unknown slot name', () => {
    expect(() =>
      defineTheme({
        key: 'typo',
        title: 'Typo',
        slots: { Postbit: stub('x') } as unknown as PartialSlotImplementations,
      }),
    ).toThrow(/unknown slot "Postbit"/)
  })

  it('rejects an element or object where a component belongs', () => {
    expect(() =>
      defineTheme({
        key: 'element',
        title: 'Element',
        slots: { Header: { type: 'div' } as unknown as SlotComponent<'Header'> },
      }),
    ).toThrow(/is not a component/)
  })

  it('rejects a client component in a server slot', () => {
    expect(() =>
      defineTheme({
        key: 'crossing',
        title: 'Crossing',
        slots: {
          PostBit: clientReference('PostBit') as unknown as SlotComponent<'PostBit'>,
        },
      }),
    ).toThrow(/fills server slot "PostBit" with a client component/)
  })

  it('accepts a client component in a client slot', () => {
    const theme = defineTheme({
      key: 'island',
      title: 'Island',
      slots: { QuickReply: clientReference('QuickReply') },
    })

    expect(hasSlot(resolveTheme(theme), 'QuickReply')).toBe(true)
  })

  it('rejects a cyclic extends chain instead of hanging', () => {
    const a: { key: string; title: string; extends?: ThemeDefinition; slots: object } = {
      key: 'a',
      title: 'A',
      slots: {},
    }
    const b: ThemeDefinition = {
      key: 'b',
      title: 'B',
      extends: a as ThemeDefinition,
      slots: {},
    }
    a.extends = b

    expect(() => defineTheme(a as ThemeDefinition)).toThrow(/cyclic extends chain/)
  })

  it('rejects copy for an unknown slot name', () => {
    expect(() =>
      defineTheme({
        key: 'typo',
        title: 'Typo',
        slots: {},
        copy: { Postbit: () => ({}) } as unknown as ThemeDefinition['copy'],
      }),
    ).toThrow(/carries copy for unknown slot "Postbit"/)
  })

  it('rejects copy that is not a function', () => {
    expect(() =>
      defineTheme({
        key: 'resolved-early',
        title: 'Resolved early',
        slots: {},
        copy: { Header: { greeting: 'Hi' } } as unknown as ThemeDefinition['copy'],
      }),
    ).toThrow(/copy for slot "Header" is not a function/)
  })

  it('rejects two themes sharing a key in one chain', () => {
    const parent = defineTheme({ key: 'dup', title: 'Parent', slots: {} })

    expect(() => defineTheme({ key: 'dup', title: 'Child', extends: parent, slots: {} })).toThrow(
      /appears twice in the extends chain/,
    )
  })
})

describe('resolveTheme', () => {
  const grandparentHeader = stub('grandparent header')
  const grandparentFooter = stub('grandparent footer')
  const grandparentPostBit = stub('grandparent postbit')
  const parentHeader = stub('parent header')
  const parentFooter = stub('parent footer')
  const childHeader = stub('child header')

  const grandparent = defineTheme({
    key: 'grandparent',
    title: 'Grandparent',
    slots: {
      Header: grandparentHeader,
      Footer: grandparentFooter,
      PostBit: grandparentPostBit,
    },
  })

  const parent = defineTheme({
    key: 'parent',
    title: 'Parent',
    extends: grandparent,
    slots: { Header: parentHeader, Footer: parentFooter },
  })

  const child = defineTheme({
    key: 'child',
    title: 'Child',
    extends: parent,
    slots: { Header: childHeader },
  })

  it('prefers the nearest implementation, three levels deep', () => {
    const resolved = resolveTheme(child)

    expect(requireSlot(resolved, 'Header')).toBe(childHeader)
    expect(requireSlot(resolved, 'Footer')).toBe(parentFooter)
    expect(requireSlot(resolved, 'PostBit')).toBe(grandparentPostBit)
  })

  it('reports the chain from the theme outward', () => {
    expect(resolveTheme(child).chain).toEqual(['child', 'parent', 'grandparent'])
  })

  it('lists the slots no theme in the chain implements', () => {
    const resolved = resolveTheme(child)

    expect(resolved.missing).not.toContain('Header')
    expect(resolved.missing).toContain('QuickReply')
    expect(resolved.missing.length).toBe(SLOT_NAMES.length - 3)
  })

  it('does not mutate the themes it resolves', () => {
    resolveTheme(child)

    expect(requireSlot(resolveTheme(parent), 'Header')).toBe(parentHeader)
    expect(hasSlot(resolveTheme(parent), 'QuickReply')).toBe(false)
  })

  it('prefers the nearest copy builder, and falls through to an ancestor for slots it does not register', () => {
    const grandparentWithCopy = defineTheme({
      key: 'grandparent',
      title: 'Grandparent',
      slots: { Header: grandparentHeader, Footer: grandparentFooter },
      copy: {
        Header: () => ({ 'grandparent.header': 'grandparent' }),
        Footer: () => ({ 'grandparent.footer': 'grandparent' }),
      },
    })
    const childWithCopy = defineTheme({
      key: 'child',
      title: 'Child',
      extends: grandparentWithCopy,
      slots: { Header: childHeader },
      copy: { Header: () => ({ 'child.header': 'child' }) },
    })

    const resolved = resolveTheme(childWithCopy)

    expect(slotCopy(resolved, 'Header', t)).toEqual({ 'child.header': 'child' })
    expect(slotCopy(resolved, 'Footer', t)).toEqual({ 'grandparent.footer': 'grandparent' })
  })

  it('gives a slot with no registered copy an empty record', () => {
    const resolved = resolveTheme(child)

    expect(slotCopy(resolved, 'PostBit', t)).toEqual({})
  })
})

describe('requireSlot', () => {
  it('names the slot and the chain when a theme has not filled it', () => {
    const theme = resolveTheme(
      defineTheme({
        key: 'sparse',
        title: 'Sparse',
        extends: defineTheme({ key: 'sparse-base', title: 'Base', slots: {} }),
        slots: {},
      }),
    )

    expect(() => requireSlot(theme, 'PostBit')).toThrow(
      /does not implement slot "PostBit"[\s\S]*sparse → sparse-base/,
    )
  })
})

describe('slotCopy', () => {
  it('hands the copy builder the translator it was given', () => {
    const theme = resolveTheme(
      defineTheme({
        key: 'greets',
        title: 'Greets',
        slots: {},
        copy: { Header: (translator) => ({ greeting: translator.t('stub.greeting') }) },
      }),
    )

    expect(slotCopy(theme, 'Header', t)).toEqual({ greeting: 'Hello' })
  })
})

describe('assertComplete', () => {
  it('throws listing what is missing', () => {
    const theme = resolveTheme(
      defineTheme({ key: 'partial', title: 'Partial', slots: { Header: stub('h') } }),
    )

    expect(() => assertComplete(theme)).toThrow(/is incomplete/)
    expect(() => assertComplete(theme)).toThrow(/PostBit/)
  })

  it('returns the full map when every slot is filled', () => {
    const theme = resolveTheme(
      defineTheme({ key: 'complete', title: 'Complete', slots: everySlot() }),
    )

    const slots = assertComplete(theme)
    for (const name of SLOT_NAMES) {
      expect(typeof slots[name as SlotName]).toBe('function')
    }
  })
})
