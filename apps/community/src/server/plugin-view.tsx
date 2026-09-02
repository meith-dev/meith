import 'server-only'

import { Fragment } from 'react'

import type { Actor } from '@meith/authorization'
import type {
  HookContext,
  HookName,
  HookValue,
  PluginRegion,
  PluginRegionContext,
} from '@meith/plugin-kit'

import { getTranslator } from './i18n'
import { pluginHost, syncPluginEnablement } from './plugin-host'

export function viewerRef(actor: Actor): { userId: number | null; isGuest: boolean } {
  return { userId: actor.userId, isGuest: actor.userId === null }
}

export async function filterView<K extends HookName>(
  name: K,
  value: HookValue<K>,
  context: HookContext<K>,
): Promise<HookValue<K>> {
  await syncPluginEnablement()
  return pluginHost.applyFilter(name, value, context)
}

export async function emitEvent<K extends HookName>(
  name: K,
  value: HookValue<K>,
  context: HookContext<K>,
): Promise<void> {
  await syncPluginEnablement()
  await pluginHost.emit(name, value, context)
}

export async function pluginRegion(
  region: PluginRegion,
  context: Omit<PluginRegionContext, 'region' | 'runtime' | 'locale' | 't'>,
  card?: string,
): Promise<React.ReactNode> {
  await syncPluginEnablement()

  const t = await getTranslator()
  const nodes = await pluginHost.renderRegion(region, { ...context, region, locale: t.locale, t })
  if (nodes.length === 0) return null

  return (
    <>
      {nodes.map((entry) =>
        card === undefined ? (
          <Fragment key={entry.key}>{entry.node}</Fragment>
        ) : (
          <section key={entry.key} className={card}>
            {entry.node}
          </section>
        ),
      )}
    </>
  )
}

export async function boardRegion(
  region: PluginRegion,
  actor: Actor,
  card?: string,
): Promise<React.ReactNode> {
  return pluginRegion(region, { viewer: viewerRef(actor), subjectId: null, authorId: null }, card)
}
