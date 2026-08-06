import 'server-only'

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

export function viewerRef(actor: Actor): { userId: number | null; isGuest: boolean } {
  return { userId: actor.userId, isGuest: actor.userId === null }
}

export async function filterView<K extends HookName>(
  name: K,
  value: HookValue<K>,
  context: HookContext<K>,
): Promise<HookValue<K>> {
  await syncOperatorDisables()
  return pluginHost.applyFilter(name, value, context)
}

export async function emitEvent<K extends HookName>(
  name: K,
  value: HookValue<K>,
  context: HookContext<K>,
): Promise<void> {
  await syncOperatorDisables()
  await pluginHost.emit(name, value, context)
}

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

export function boardRegion(region: PluginRegion, actor: Actor): React.ReactNode {
  return pluginRegion(region, { viewer: viewerRef(actor), subjectId: null, authorId: null })
}
