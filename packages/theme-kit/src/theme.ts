import type { ReactNode } from 'react'

import { isSlotName, SLOT_NAMES, SLOTS, type SlotName } from './slots'
import type { SlotModels } from './view-models'

export type SlotComponent<K extends SlotName> = (typeof SLOTS)[K]['kind'] extends 'client'
  ? (props: SlotModels[K]) => ReactNode
  : (props: SlotModels[K]) => ReactNode | Promise<ReactNode>

export type SlotImplementations = { readonly [K in SlotName]: SlotComponent<K> }

export type PartialSlotImplementations = { readonly [K in SlotName]?: SlotComponent<K> }

export interface ThemeDefinition {
  readonly key: string
  readonly title: string
  readonly extends?: ThemeDefinition | undefined
  readonly slots: PartialSlotImplementations
}

export interface ResolvedTheme {
  readonly key: string
  readonly title: string
  readonly chain: readonly string[]
  readonly slots: PartialSlotImplementations
  readonly missing: readonly SlotName[]
}

const CLIENT_REFERENCE_TYPES: readonly symbol[] = [
  Symbol.for('react.client.reference'),
  Symbol.for('react.module.reference'),
]

function isClientReference(value: unknown): boolean {
  if (typeof value !== 'function' && typeof value !== 'object') return false
  if (value === null) return false
  const marker = (value as { $$typeof?: unknown }).$$typeof
  return typeof marker === 'symbol' && CLIENT_REFERENCE_TYPES.includes(marker)
}

export function defineTheme(theme: ThemeDefinition): ThemeDefinition {
  if (theme.key.trim() === '') {
    throw new Error('defineTheme: key must not be empty.')
  }
  if (theme.title.trim() === '') {
    throw new Error(`defineTheme: theme "${theme.key}" must have a title.`)
  }

  for (const [name, component] of Object.entries(theme.slots)) {
    if (!isSlotName(name)) {
      throw new Error(
        `defineTheme: theme "${theme.key}" fills unknown slot "${name}". ` +
          `Known slots: ${SLOT_NAMES.join(', ')}`,
      )
    }
    if (component === undefined) continue

    if (typeof component !== 'function' && !isClientReference(component)) {
      throw new Error(
        `defineTheme: theme "${theme.key}" slot "${name}" is not a component. ` +
          'Pass the component itself, not an element or an object.',
      )
    }

    if (SLOTS[name].kind === 'server' && isClientReference(component)) {
      throw new Error(
        `defineTheme: theme "${theme.key}" fills server slot "${name}" with a ` +
          'client component. That slot renders on the server and ships no ' +
          'JavaScript; a "use client" implementation sends its whole subtree to ' +
          'the browser. Move the interactive part into a child island instead.',
      )
    }
  }

  assertAcyclic(theme)
  return theme
}

function assertAcyclic(theme: ThemeDefinition): void {
  const seenObjects = new Set<ThemeDefinition>()
  const seenKeys = new Set<string>()
  let current: ThemeDefinition | undefined = theme

  while (current !== undefined) {
    if (seenObjects.has(current)) {
      throw new Error(
        `defineTheme: theme "${theme.key}" has a cyclic extends chain ` +
          `(revisits "${current.key}"). Resolution would never terminate.`,
      )
    }
    if (seenKeys.has(current.key)) {
      throw new Error(
        `defineTheme: key "${current.key}" appears twice in the extends chain of ` +
          `"${theme.key}". Keys identify a theme for token overrides; two ` +
          'themes sharing one make that lookup ambiguous.',
      )
    }
    seenObjects.add(current)
    seenKeys.add(current.key)
    current = current.extends
  }
}

export function resolveTheme(theme: ThemeDefinition): ResolvedTheme {
  const slots: Record<string, unknown> = {}
  const chain: string[] = []

  let current: ThemeDefinition | undefined = theme
  while (current !== undefined) {
    chain.push(current.key)
    for (const [name, component] of Object.entries(current.slots)) {
      if (component === undefined) continue
      if (!Object.hasOwn(slots, name)) slots[name] = component
    }
    current = current.extends
  }

  const missing = SLOT_NAMES.filter((name) => !Object.hasOwn(slots, name))

  return {
    key: theme.key,
    title: theme.title,
    chain,
    slots: slots as PartialSlotImplementations,
    missing,
  }
}

export function requireSlot<K extends SlotName>(theme: ResolvedTheme, name: K): SlotComponent<K> {
  const component = theme.slots[name]
  if (component === undefined) {
    throw new Error(
      `Theme "${theme.key}" does not implement slot "${name}" ` +
        `(chain: ${theme.chain.join(' → ')}). Implement it, extend a theme that ` +
        'does, or have the page check hasSlot() if the region is optional.',
    )
  }
  return component as SlotComponent<K>
}

export function hasSlot(theme: ResolvedTheme, name: SlotName): boolean {
  return theme.slots[name] !== undefined
}

export function assertComplete(theme: ResolvedTheme): SlotImplementations {
  if (theme.missing.length > 0) {
    throw new Error(
      `Theme "${theme.key}" is incomplete: ${theme.missing.length} slot(s) ` +
        `unimplemented — ${theme.missing.join(', ')}.`,
    )
  }
  return theme.slots as SlotImplementations
}
