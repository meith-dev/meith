import type { ReactNode } from 'react'

import type { Translator } from '@meith/i18n'

import { isSlotName, SLOT_NAMES, SLOTS, type SlotName } from './slots'
import type { SlotModels } from './view-models'

export type SlotComponent<K extends SlotName> = (typeof SLOTS)[K]['kind'] extends 'client'
  ? (props: SlotModels[K] & { readonly copy: SlotCopy }) => ReactNode
  : (props: SlotModels[K] & { readonly copy: SlotCopy }) => ReactNode | Promise<ReactNode>

export type SlotImplementations = { readonly [K in SlotName]: SlotComponent<K> }

export type PartialSlotImplementations = { readonly [K in SlotName]?: SlotComponent<K> }

/**
 * A slot's copy: the theme's own words for a region, resolved server-side so
 * the slot itself never needs a translator or a locale — the same bargain a
 * CountModel makes for a number. A theme registers one of these per slot
 * alongside its component; the key names are the theme's own, not shared
 * with any other theme, so two themes registered on the same board never
 * collide.
 */
export type SlotCopy = Readonly<Record<string, string>>

export type SlotCopyBuilder = (t: Translator) => SlotCopy

export type PartialSlotCopyBuilders = { readonly [K in SlotName]?: SlotCopyBuilder }

export interface ThemeDefinition {
  readonly key: string
  readonly title: string
  readonly extends?: ThemeDefinition | undefined
  readonly slots: PartialSlotImplementations
  readonly copy?: PartialSlotCopyBuilders | undefined
}

export interface ResolvedTheme {
  readonly key: string
  readonly title: string
  readonly chain: readonly string[]
  readonly slots: PartialSlotImplementations
  readonly copy: PartialSlotCopyBuilders
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

  for (const [name, builder] of Object.entries(theme.copy ?? {})) {
    if (!isSlotName(name)) {
      throw new Error(
        `defineTheme: theme "${theme.key}" carries copy for unknown slot "${name}". ` +
          `Known slots: ${SLOT_NAMES.join(', ')}`,
      )
    }
    if (builder !== undefined && typeof builder !== 'function') {
      throw new Error(
        `defineTheme: theme "${theme.key}" copy for slot "${name}" is not a function. ` +
          'Pass a (t: Translator) => SlotCopy, not the resolved record itself — ' +
          'the words differ by viewer, so they cannot be resolved until then.',
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
  const copy: Record<string, unknown> = {}
  const chain: string[] = []

  let current: ThemeDefinition | undefined = theme
  while (current !== undefined) {
    chain.push(current.key)
    for (const [name, component] of Object.entries(current.slots)) {
      if (component === undefined) continue
      if (!Object.hasOwn(slots, name)) slots[name] = component
    }
    for (const [name, builder] of Object.entries(current.copy ?? {})) {
      if (builder === undefined) continue
      if (!Object.hasOwn(copy, name)) copy[name] = builder
    }
    current = current.extends
  }

  const missing = SLOT_NAMES.filter((name) => !Object.hasOwn(slots, name))

  return {
    key: theme.key,
    title: theme.title,
    chain,
    slots: slots as PartialSlotImplementations,
    copy: copy as PartialSlotCopyBuilders,
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

/**
 * The theme's own words for a slot, resolved for this viewer. A theme that
 * fills the slot but never registered copy for it (nothing to say beyond
 * the view model) gets an empty record — `fromCopy` falls back to the key,
 * same as everywhere else a copy record is read.
 */
export function slotCopy(theme: ResolvedTheme, name: SlotName, t: Translator): SlotCopy {
  const builder = theme.copy[name]
  return builder === undefined ? {} : builder(t)
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
