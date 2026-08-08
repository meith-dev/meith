import 'server-only'

/**
 * F80 — the two lines every call site uses to reach a plugin.
 *
 * Wiring is the part of a plugin system that actually decides whether it works.
 * F79 built the registry, the types and the host; until a call site fires a
 * hook, every one of them is a documented promise about code that never runs —
 * which is precisely what F80's reference plugin exists to disprove.
 *
 * Two helpers, and both exist to make the call site *short*. A wiring step that
 * takes four lines at each of thirty places gets skipped at the thirty-first,
 * and a hook nobody fires is indistinguishable from a hook that does not exist.
 */
import type { Actor } from '@meith/authorization'
import {
  type HookContext,
  type HookName,
  type HookValue,
  type PluginRegion,
  type PluginRegionContext,
} from '@meith/plugin-kit'
import { Fragment } from 'react'

import { pluginHost, syncOperatorDisables } from './plugin-host'

/**
 * The viewer, as much of one as a plugin is ever told.
 *
 * Never the `Actor`. It carries resolved group membership and is the input to
 * `authorization.can()`; handing one over invites a plugin to make its own
 * permission decision from group ids, which is what R4 forbids of core code and
 * doubly of code an operator installed from a directory.
 */
export function viewerRef(actor: Actor): { userId: number | null; isGuest: boolean } {
  return { userId: actor.userId, isGuest: actor.userId === null }
}

/**
 * Run a filter chain over a value on its way to the theme.
 *
 * A thin pass-through to the host, and deliberately not thinner: every call site
 * imports this rather than `pluginHost` directly, so `scripts/hook-callsites.mjs`
 * has one shape to scan for and the wired set stays discoverable.
 */
export async function filterView<K extends HookName>(
  name: K,
  value: HookValue<K>,
  context: HookContext<K>,
): Promise<HookValue<K>> {
  await syncOperatorDisables()
  return pluginHost.applyFilter(name, value, context)
}

/** Tell plugins something happened. Never awaited for its result — there is none. */
export async function emitEvent<K extends HookName>(
  name: K,
  value: HookValue<K>,
  context: HookContext<K>,
): Promise<void> {
  await syncOperatorDisables()
  await pluginHost.emit(name, value, context)
}

/**
 * Render a plugin region, or nothing.
 *
 * Returns `null` rather than an empty fragment when no plugin contributes, so a
 * theme's `{regions.plugins !== null && …}` does not wrap emptiness in a border.
 *
 * The keys are plugin keys, which are unique by construction — `defineCommunityConfig`
 * refuses a duplicate — so React's reconciliation is stable across renders
 * without the host inventing an index.
 */
export function pluginRegion(
  region: PluginRegion,
  context: Omit<PluginRegionContext, 'region'>,
): React.ReactNode {
  const nodes = pluginHost.renderRegion(region, { ...context, region })
  if (nodes.length === 0) return null

  return (
    <>
      {nodes.map((entry) => (
        <Fragment key={entry.key}>{entry.node}</Fragment>
      ))}
    </>
  )
}

/** The common case: a region that is only about who is looking. */
export function boardRegion(region: PluginRegion, actor: Actor): React.ReactNode {
  return pluginRegion(region, { viewer: viewerRef(actor), subjectId: null, authorId: null })
}
