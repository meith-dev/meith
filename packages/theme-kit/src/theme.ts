/**
 * F25 — `defineTheme`, inheritance, and resolution.
 *
 * A theme is a **map from slot name to component**, plus a key and a title. It
 * is not a directory of files with magic names: the manifest is a module that is
 * imported statically, for the reasons invariant 6 gives (a serverless bundle
 * contains only what the bundler saw, and nothing is discovered by scanning a
 * directory at request time).
 *
 * ## `extends`
 *
 * Themes inherit. A child theme names a parent and overrides the slots it cares
 * about; everything else resolves through the chain. This is the difference
 * between "install a theme" and "fork the default theme", and it is what makes
 * F78's second theme a few files rather than a copy of the first — a copy stops
 * receiving fixes the moment it is made.
 *
 * Resolution is shallowest-wins-per-slot: the child's implementation shadows the
 * parent's for that slot only. There is no partial merging *within* a slot; a
 * slot is one component and overriding it is total. Anything else means two
 * themes co-rendering one region, which is unpredictable to reason about and
 * impossible to type.
 *
 * ## Incomplete themes are legal, and stay legal until F77
 *
 * Slots exist for pages that are not built yet (`WhoIsOnline` needs F75). A
 * theme cannot implement those, so `resolveTheme` returns what is filled plus
 * the list of what is missing, rather than throwing. Pages ask for the slots
 * they need and get a clear error naming the slot if a theme has not filled it.
 *
 * `assertComplete` is the strict form, for F77's freeze and for any board
 * that wants installation to fail loudly rather than at first render.
 */

import type { ReactNode } from 'react'

import { isSlotName, SLOTS, SLOT_NAMES, type SlotName } from './slots'
import type { SlotModels } from './view-models'

/**
 * The function type a slot's implementation must have.
 *
 * The kind is resolved to a *different signature*, which is where the
 * server/client distinction earns its first line of defence: a `client` slot
 * written as an `async` component does not compile, because an async component
 * is a server-only construct. React would otherwise accept it at build time and
 * fail in the browser with a message about a promise being rendered.
 *
 * This is a necessary check, not a sufficient one — a synchronous component in a
 * `"use client"` file satisfies both signatures. That case is what
 * `scripts/slot-kinds.mjs` exists for.
 */
export type SlotComponent<K extends SlotName> = (typeof SLOTS)[K]['kind'] extends 'client'
  ? (props: SlotModels[K]) => ReactNode
  : (props: SlotModels[K]) => ReactNode | Promise<ReactNode>

/** A complete slot map. Only F77's freeze requires one. */
export type SlotImplementations = { readonly [K in SlotName]: SlotComponent<K> }

/** What a theme actually ships: some slots, not necessarily all. */
export type PartialSlotImplementations = { readonly [K in SlotName]?: SlotComponent<K> }

export interface ThemeDefinition {
  /** Stable key. Matches the key it is registered under in `community.config.ts`. */
  readonly key: string
  readonly title: string
  /** The theme this one inherits unfilled slots from. */
  readonly extends?: ThemeDefinition | undefined
  readonly slots: PartialSlotImplementations
}

export interface ResolvedTheme {
  readonly key: string
  readonly title: string
  /** Chain from this theme to its furthest ancestor, by key. Diagnostic. */
  readonly chain: readonly string[]
  readonly slots: PartialSlotImplementations
  /** Slots no theme in the chain implements. Empty for a complete theme. */
  readonly missing: readonly SlotName[]
}

/**
 * The `$$typeof` a bundler stamps on a client-component reference.
 *
 * In an RSC build, importing a `"use client"` module from a server module does
 * not give you the function — it gives you a reference object carrying this
 * marker. That makes a *runtime* kind check possible for anything that is
 * actually rendered, which is a genuinely different net from the static one:
 * static analysis follows the manifest's import, and this follows the value.
 *
 * `react.module.reference` is the older spelling and is checked too, because a
 * check that silently stops matching is worse than no check (D10).
 *
 * Outside an RSC build — vitest, the CLI — nothing carries a marker, so absence
 * proves nothing and is never treated as evidence. Only a positive marker in a
 * server slot is an error.
 */
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

/**
 * Validate a theme manifest and return it typed.
 *
 * Same shape and same reasoning as `defineForumConfig` (invariant 6): an
 * identity function whose job is to attach the type and check the things that
 * would otherwise fail a long way from their cause.
 *
 * What is checked, and the failure each check prevents:
 *
 *  - **an unknown slot name** — a typo'd slot is not a compile error when the
 *    manifest is built by spreading or by a plugin, and the symptom is a region
 *    that silently never renders. Loud here, invisible later.
 *  - **a client reference in a server slot** — the bytes-in-the-browser failure
 *    this whole feature exists to prevent, caught for anything the bundler
 *    marked. See `CLIENT_REFERENCE_TYPES` for why absence is not checked.
 *  - **a non-function implementation** — passing an element (`<Header />`)
 *    instead of the component is an easy slip and renders as nothing.
 *  - **an inheritance cycle** — `a extends b extends a` is an infinite walk in
 *    `resolveTheme`, i.e. a hang rather than an error.
 *  - **a duplicate key in the chain** — two themes with the same key make
 *    `chain` ambiguous and any key-based override (F26's per-board tokens) hit
 *    the wrong one.
 */
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

/** Walk the `extends` chain, rejecting cycles and duplicate keys. */
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
          `"${theme.key}". Keys identify a theme for token overrides (F26); two ` +
          'themes sharing one make that lookup ambiguous.',
      )
    }
    seenObjects.add(current)
    seenKeys.add(current.key)
    current = current.extends
  }
}

/**
 * Flatten a theme and its ancestors into one slot map.
 *
 * Nearest wins: the theme's own slots, then its parent's, and so on. Written as
 * a walk from the theme outward with a first-write-wins assignment rather than
 * an overwrite from the root inward, so a child's implementation is never
 * momentarily replaced by a parent's — the same ordering trap as
 * invalidate-after-write in the cache layer.
 */
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

/**
 * Read one slot, or throw naming it.
 *
 * The alternative — returning `undefined` and letting the page render nothing —
 * is how a theme upgrade loses a region silently. A page asking for a slot has
 * decided the slot is required; an *optional* region is expressed by the page
 * checking `hasSlot` first, which is explicit at the call site.
 */
export function requireSlot<K extends SlotName>(
  theme: ResolvedTheme,
  name: K,
): SlotComponent<K> {
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
 * Throw unless every slot is filled.
 *
 * Not called during Phase 2: slots exist for pages that are not built, so no
 * theme can be complete yet and a hard check here would make the registry
 * unusable. F77 turns this on at the freeze, and a board that prefers a loud
 * install to a late 500 can call it itself.
 */
export function assertComplete(theme: ResolvedTheme): SlotImplementations {
  if (theme.missing.length > 0) {
    throw new Error(
      `Theme "${theme.key}" is incomplete: ${theme.missing.length} slot(s) ` +
        `unimplemented — ${theme.missing.join(', ')}.`,
    )
  }
  return theme.slots as SlotImplementations
}
